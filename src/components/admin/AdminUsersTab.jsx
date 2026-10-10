import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, ChevronDown, Mail, Crown, Calendar, ShoppingBag, Activity, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { PLANS } from '@/lib/plans';
import { hashIosDiagId } from '@/lib/iosPurchaseDiagnostics';
import {
  getEffectivePlanId,
  getEffectiveExpirationDate,
  isGenericPlanActive,
  isGoogleTrailblazerActive,
} from '@/lib/access';

const PLAN_BADGE = {
  observer: 'bg-muted/20 text-muted-foreground border-muted-foreground/30',
  explorer: 'bg-primary/20 text-primary border-primary/40',
  investigator: 'bg-accent/20 text-accent-foreground border-accent/40',
  trailblazer: 'bg-amber-500/15 text-amber-300 border-amber-400/40',
};

const STATUS_BADGE = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  canceled: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  expired: 'bg-destructive/15 text-destructive border-destructive/30',
  none: 'bg-muted/20 text-muted-foreground border-muted-foreground/30',
};

const DIAG_LEVEL_BADGE = {
  info: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
  warn: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  error: 'bg-destructive/15 text-destructive border-destructive/30',
};

/** Bounded admin report size for the per-user iOS diagnostics section. */
const DIAG_HISTORY_LIMIT = 25;

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Parse the bounded details_json string stored on a diagnostic row.
 * Returns {} on any malformed payload — rendering must never throw.
 */
function parseDiagDetails(detailsJson) {
  if (!detailsJson) return {};
  try {
    const parsed = typeof detailsJson === 'string' ? JSON.parse(detailsJson) : detailsJson;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** One-line summary of the most decision-useful safe detail fields. */
function diagDetailSummary(details) {
  const parts = [];
  if (details.dashboardProductId) parts.push(`product ${details.dashboardProductId}`);
  else if (details.appleProductId) parts.push(details.appleProductId);
  if (details.reason) parts.push(`reason ${details.reason}`);
  if (details.outcome && !parts.length) parts.push(details.outcome);
  if (Array.isArray(details.activeEntitlementIds) && details.activeEntitlementIds.length) {
    parts.push(`entitlements: ${details.activeEntitlementIds.join(', ')}`);
  }
  if (details.observedPlan) {
    parts.push(`observed plan ${details.observedPlan}${details.planMatches ? ' (match)' : ''}`);
  }
  return parts.slice(0, 3).join(' · ');
}

/** True when a query failure means the diagnostics backend is not deployed. */
function isDiagBackendMissing(error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  if (status === 404 || status === 501) return true;
  const msg = String(error?.message || error?.data?.error || '').toLowerCase();
  return msg.includes('not found') || msg.includes('unknown entity') || msg.includes('does not exist');
}

function sourceLabel(user) {
  const g = isGoogleTrailblazerActive(user);
  const w = isGenericPlanActive(user);
  if (g && w) return 'Google + Apple/Wix';
  if (g) return 'Google Play';
  if (w) return 'Apple / Wix';
  return '—';
}

export default function AdminUsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [historyCache, setHistoryCache] = useState({});
  // Per-user iOS subscription diagnostics:
  // { [userId]: { status: 'loading'|'ok'|'unavailable'|'error', rows, message? } }
  // 'unavailable' = the IosPurchaseDiagnostic entity/function is not deployed
  // yet; 'error' = retryable query failure. Never conflated with "no rows".
  const [diagCache, setDiagCache] = useState({});

  const loadUsers = useCallback(async () => {
    try {
      const list = await base44.entities.User.list('-created_date', 500);
      setUsers(Array.isArray(list) ? list : list?.items || []);
    } catch (e) {
      console.error('Admin users load failed:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadHistory = useCallback(async (user) => {
    if (historyCache[user.id]) return;
    try {
      const [rc, wix] = await Promise.all([
        base44.entities.RevenueCatPurchase.filter({ user_id: user.id }).catch(() => []),
        base44.entities.Base44Purchase.filter({ user_id: user.id }).catch(() => []),
      ]);
      const rcRows = (Array.isArray(rc) ? rc : rc?.items || [])
        .map((r) => ({ ...r, _source: r.store || 'RevenueCat' }))
        .sort((a, b) => new Date(b.purchase_date || b.purchased_at || 0) - new Date(a.purchase_date || a.purchased_at || 0));
      const wixRows = (Array.isArray(wix) ? wix : wix?.items || [])
        .map((r) => ({ ...r, _source: 'Wix' }))
        .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
      setHistoryCache((prev) => ({ ...prev, [user.id]: [...rcRows, ...wixRows] }));
    } catch (e) {
      console.error('Purchase history load failed:', e);
      setHistoryCache((prev) => ({ ...prev, [user.id]: [] }));
    }
  }, [historyCache]);

  const loadDiagnostics = useCallback(async (user, force = false) => {
    const existing = diagCache[user.id];
    if (existing && !force) return;
    // The entity accessor may not exist until the Base44 entity is deployed —
    // surface that as an explicit unavailable state, not an empty report.
    if (!base44.entities.IosPurchaseDiagnostic) {
      setDiagCache((prev) => ({ ...prev, [user.id]: { status: 'unavailable', rows: [] } }));
      return;
    }
    setDiagCache((prev) => ({
      ...prev,
      [user.id]: { status: 'loading', rows: prev[user.id]?.rows || [] },
    }));
    try {
      // Filter by the redaction token of the selected user's id — the same
      // hash the record function computes and stores server-side. The raw
      // user id stays local to this hash call.
      const rows = await base44.entities.IosPurchaseDiagnostic.filter(
        { user_id_hash: hashIosDiagId(user.id) },
        '-created_date',
        DIAG_HISTORY_LIMIT,
      );
      setDiagCache((prev) => ({
        ...prev,
        [user.id]: { status: 'ok', rows: Array.isArray(rows) ? rows : /** @type {any} */ (rows)?.items || [] },
      }));
    } catch (e) {
      setDiagCache((prev) => ({
        ...prev,
        [user.id]: isDiagBackendMissing(e)
          ? { status: 'unavailable', rows: [] }
          : { status: 'error', rows: [], message: e?.message || 'Failed to load diagnostics' },
      }));
    }
  }, [diagCache]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const name = (u.display_name || u.full_name || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card/50 border-border/40 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No users found.</p>
      ) : (
        filtered.map((u, i) => {
          const planId = getEffectivePlanId(u);
          const planName = PLANS[planId]?.name || 'Observer';
          const exp = getEffectiveExpirationDate(u);
          const isOpen = expandedId === u.id;
          const history = historyCache[u.id];
          const diag = diagCache[u.id];
          const subStatus = u.subscription_status || 'none';

          return (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.4) }}
              className="rounded-lg border border-border/40 bg-card/40 overflow-hidden"
            >
              <button
                onClick={() => {
                  const next = isOpen ? null : u.id;
                  setExpandedId(next);
                  if (next) {
                    loadHistory(u);
                    loadDiagnostics(u);
                  }
                }}
                className="w-full p-3 flex items-start justify-between gap-3 text-left"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">
                      {u.display_name || u.full_name || 'Unnamed'}
                    </p>
                    {u.role === 'admin' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-400/40 uppercase tracking-wider">
                        <Crown className="w-2.5 h-2.5" /> Admin
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3 shrink-0" />
                    {u.email || '—'}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${PLAN_BADGE[planId] || PLAN_BADGE.observer}`}>
                      {planName}
                    </span>
                    {planId !== 'observer' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${STATUS_BADGE[subStatus] || STATUS_BADGE.none}`}>
                        {subStatus}
                      </span>
                    )}
                    {planId !== 'observer' && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" />
                        {formatDate(exp)}
                      </span>
                    )}
                  </div>
                  {planId !== 'observer' && (
                    <p className="text-[10px] text-muted-foreground/70">Source: {sourceLabel(u)}</p>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="border-t border-border/30 px-3 py-3 bg-secondary/20 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3" /> Purchase History
                  </p>
                  {!history ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No purchases on record.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto toolkit-scroll">
                      {history.map((p, idx) => (
                        <div key={p.id || idx} className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-card/30">
                          <div className="min-w-0">
                            <p className="text-foreground truncate">{p.product_name || p.product_id || '—'}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {p._source} · {formatDate(p.purchase_date || p.purchased_at || p.created_date)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {p.amount != null && (
                              <span className="text-muted-foreground">
                                {p.currency ? `${p.currency} ` : ''}{Number(p.amount).toFixed(2)}
                              </span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${STATUS_BADGE[p.status] || STATUS_BADGE.none}`}>
                              {p.status || '—'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* iOS subscription purchase diagnostics — separate entity,
                      never merged into purchase/entitlement history. */}
                  <div className="border-t border-border/20 pt-2 mt-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Activity className="w-3 h-3" /> iOS Subscription Diagnostics
                    </p>
                    {(!diag || diag.status === 'loading') ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                      </div>
                    ) : diag.status === 'unavailable' ? (
                      <p className="text-xs text-muted-foreground py-2">
                        Diagnostics backend is not deployed yet (IosPurchaseDiagnostic entity /
                        record-ios-purchase-diagnostic function). The report appears here once
                        deployed and an iOS purchase attempt has been recorded.
                      </p>
                    ) : diag.status === 'error' ? (
                      <div className="flex items-center justify-between gap-2 py-2">
                        <p className="text-xs text-destructive min-w-0 break-words">
                          Failed to load diagnostics{diag.message ? `: ${diag.message}` : '.'}
                        </p>
                        <button
                          onClick={() => loadDiagnostics(u, true)}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:bg-primary/10 shrink-0"
                          aria-label="Retry loading iOS subscription diagnostics"
                        >
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      </div>
                    ) : diag.rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        No iOS subscription diagnostics recorded for this account.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto toolkit-scroll">
                        {diag.rows.map((row, idx) => {
                          const details = parseDiagDetails(row.details_json);
                          const summary = diagDetailSummary(details);
                          const errText = details.errorMessage
                            ? `${details.errorCode ? `[${details.errorCode}] ` : ''}${details.errorMessage}`
                            : null;
                          return (
                            <div key={row.id || row.event_id || idx} className="text-xs py-1 px-2 rounded bg-card/30 space-y-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-foreground truncate font-mono text-[11px]">{row.event_name || '—'}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${DIAG_LEVEL_BADGE[row.level] || STATUS_BADGE.none}`}>
                                  {row.level || '—'}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate" title={row.session_id || undefined}>
                                {formatDateTime(row.occurred_at || row.created_date)} · session {row.session_id || '—'} ·{' '}
                                <span className="text-foreground/70">{row.outcome || '—'}</span>
                              </p>
                              {summary && (
                                <p className="text-[10px] text-muted-foreground break-words">{summary}</p>
                              )}
                              {errText && (
                                <p className="text-[10px] text-destructive break-words">{errText}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })
      )}
    </div>
  );
}