//
// Admin-only persistent iOS subscription purchase diagnostics report.
// ---------------------------------------------------------------------------
// Settings-page companion to the per-user section in
// src/components/admin/AdminUsersTab.jsx and to the TEMPORARY in-memory
// AdDiagnosticsPanel (whose card/status/actions/log structure this panel
// follows). It reads the server-persisted IosPurchaseDiagnostic entity —
// written ONLY by the record-ios-purchase-diagnostic function (service role).
//
// Security / privacy contract (unchanged by this panel):
//  - Reads hit the entity directly, where RLS restricts read to role: admin
//    SERVER-SIDE. The parent page additionally renders this panel for admins
//    only as a convenience — enforcement never rests on UI hiding.
//  - Every displayed identifier is already redacted at rest: opaque session /
//    event ids and id_XXXXXXXX hash tokens (user, RevenueCat customer,
//    transaction). No raw user ids, emails, tokens, secrets, or receipts are
//    stored by the backend, so none can be displayed or copied here.
//  - This panel NEVER touches User records, RevenueCatPurchase /
//    Base44Purchase ledgers, or any entitlement/grant field.
//

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getIosPurchaseDiagOutboxSize } from '@/lib/iosPurchaseDiagnostics';

/** Bounded report size — keeps admin rendering fast and payloads small. */
const REPORT_LIMIT = 50;

const LEVEL_BADGE = {
  info: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
  warn: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  error: 'bg-destructive/15 text-destructive border-destructive/30',
};
const LEVEL_BADGE_FALLBACK = 'bg-muted/20 text-muted-foreground border-muted-foreground/30';

const LEVEL_DOT = {
  info: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
};
const LEVEL_DOT_FALLBACK = 'bg-slate-500';

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

function formatTime(ts) {
  try {
    return new Date(ts).toTimeString().slice(0, 8);
  } catch {
    return '--:--:--';
  }
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

/** One-line summary of the stored product/plan detail fields (public ids). */
function productPlanSummary(details) {
  const parts = [];
  if (details.dashboardProductId) parts.push(`product ${details.dashboardProductId}`);
  else if (details.appleProductId) parts.push(`product ${details.appleProductId}`);
  if (details.returnedProductIdentifier) parts.push(`returned ${details.returnedProductIdentifier}`);
  if (details.planId || details.expectedPlanId) {
    parts.push(`plan ${details.planId || details.expectedPlanId}`);
  }
  if (details.observedPlan) {
    parts.push(`observed ${details.observedPlan}${details.planMatches ? ' (match)' : ''}`);
  }
  if (details.observedSubscriptionStatus) parts.push(`status ${details.observedSubscriptionStatus}`);
  if (details.reason) parts.push(`reason ${details.reason}`);
  return parts.slice(0, 4).join(' · ');
}

/** One-line summary of the stored entitlement detail fields. */
function entitlementSummary(details) {
  const parts = [];
  if (Array.isArray(details.activeEntitlementIds) && details.activeEntitlementIds.length) {
    parts.push(`active: ${details.activeEntitlementIds.join(', ')}`);
  }
  if (typeof details.hasActiveEntitlement === 'boolean') {
    parts.push(`hasActiveEntitlement: ${details.hasActiveEntitlement ? 'yes' : 'no'}`);
  }
  return parts.join(' · ');
}

/** Pre-scrubbed error detail (server sanitize + entity allowlist) as one line. */
function errorSummary(details) {
  if (!details.errorMessage) return null;
  return `${details.errorCode ? `[${details.errorCode}] ` : ''}${details.errorMessage}`;
}

/** True when a query failure means the diagnostics backend is not deployed. */
function isDiagBackendMissing(error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  if (status === 404 || status === 501) return true;
  const msg = String(error?.message || error?.data?.error || '').toLowerCase();
  return msg.includes('not found') || msg.includes('unknown entity') || msg.includes('does not exist');
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

/**
 * Plain-text support report built ONLY from fields already stored (and
 * therefore already redacted) on the diagnostic rows. Never throws.
 */
function buildReport(rows) {
  try {
    const lines = [];
    lines.push('AGES Explorer — iOS Subscription Diagnostics Report (Admin)');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push(`EVENTS (${rows.length}, newest first)`);
    for (const row of rows) {
      const details = parseDiagDetails(row.details_json);
      lines.push(
        `[${row.occurred_at || row.created_date || 'unknown'}] ${row.level || 'info'} ` +
          `${row.event_name || 'unknown'} — outcome ${row.outcome || '—'} ` +
          `session ${row.session_id || '—'} user ${row.user_id_hash || '—'}`,
      );
      const productPlan = productPlanSummary(details);
      if (productPlan) lines.push(`    product/plan: ${productPlan}`);
      const entitlements = entitlementSummary(details);
      if (entitlements) lines.push(`    entitlements: ${entitlements}`);
      const error = errorSummary(details);
      if (error) lines.push(`    error: ${error}`);
    }
    return lines.join('\n');
  } catch {
    return 'Failed to build diagnostics report.';
  }
}

/**
 * @param {{ label: string, value: any, tone?: 'ok' | 'bad' | 'warn' | 'muted' | 'plain' }} props
 */
function StatusRow({ label, value, tone = 'plain' }) {
  const toneClass = {
    ok: 'text-emerald-400',
    bad: 'text-red-400',
    warn: 'text-amber-400',
    muted: 'text-muted-foreground',
    plain: 'text-foreground',
  };
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span className={`text-[11px] text-right ${empty ? toneClass.muted : toneClass[tone] || toneClass.plain}`}>
        {empty ? '—' : String(value)}
      </span>
    </div>
  );
}

/**
 * Persistent iOS subscription diagnostics report for admins. Rendered by
 * src/pages/Settings.jsx only when the signed-in user is an admin; entity RLS
 * independently enforces admin-only reads server-side.
 */
export default function IosPurchaseDiagnosticsPanel() {
  // status: 'idle' | 'loading' | 'ok' | 'unavailable' | 'error'.
  // 'unavailable' = the IosPurchaseDiagnostic entity/function is not deployed
  // yet; 'error' = retryable query failure. Never conflated with "no rows".
  const [report, setReport] = useState({ status: 'idle', rows: [], message: '', refreshedAt: null });
  const [outboxCount, setOutboxCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setOutboxCount(getIosPurchaseDiagOutboxSize());
    // The entity accessor may not exist until the Base44 entity is deployed —
    // surface that as an explicit unavailable state, not an empty report.
    if (!base44.entities.IosPurchaseDiagnostic) {
      setReport({ status: 'unavailable', rows: [], message: '', refreshedAt: Date.now() });
      return;
    }
    setReport((prev) => ({ ...prev, status: 'loading', message: '' }));
    try {
      const rows = await base44.entities.IosPurchaseDiagnostic.list('-created_date', REPORT_LIMIT);
      setReport({
        status: 'ok',
        rows: Array.isArray(rows) ? rows : /** @type {any} */ (rows)?.items || [],
        message: '',
        refreshedAt: Date.now(),
      });
    } catch (e) {
      setReport((prev) => ({
        status: isDiagBackendMissing(e) ? 'unavailable' : 'error',
        rows: prev.rows,
        message: /** @type {any} */ (e)?.message || 'Failed to load diagnostics',
        refreshedAt: Date.now(),
      }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(buildReport(report.rows));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const { status, rows } = report;
  const loading = status === 'loading' || status === 'idle';
  const initialLoading = loading && rows.length === 0;
  const backendLabel =
    status === 'ok' ? 'Deployed' : status === 'unavailable' ? 'Not deployed' : status === 'error' ? 'Query failed' : '—';
  const backendTone =
    status === 'ok' ? 'ok' : status === 'unavailable' || status === 'error' ? 'bad' : 'muted';

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border/30">
        <h3 className="text-xs font-heading uppercase tracking-wider text-primary flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5" /> iOS Purchase Diagnostics
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-heading uppercase tracking-wider text-primary">
            <ShieldCheck className="w-2.5 h-2.5" /> Admin only
          </span>
        </h3>
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
          Persistent, redacted record of native iOS subscription purchase attempts (Explorer /
          Investigator), uploaded best-effort from devices. Identifiers are stored only as hash
          tokens; reads are restricted to admins by the backend. Use Refresh after a purchase
          attempt on a device, or Copy report to share a safe copy with support.
        </p>
      </div>

      {/* Status */}
      <div className="p-3 border-b border-border/30">
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1">
          Status
        </p>
        <StatusRow label="Diagnostics backend" value={backendLabel} tone={backendTone} />
        <StatusRow label="Events shown" value={report.status === 'ok' ? rows.length : null} />
        <StatusRow label="Pending upload on this device" value={outboxCount} />
        <StatusRow
          label="Last refreshed"
          value={report.refreshedAt ? formatTime(report.refreshedAt) : '—'}
          tone="muted"
        />
      </div>

      {/* Actions */}
      <div className="p-3 flex items-center gap-2 border-b border-border/30">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary text-[11px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors min-h-[44px] flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh report
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={rows.length === 0}
          className="px-3 py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary text-[11px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors min-h-[44px] flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copy report
            </>
          )}
        </button>
      </div>

      {/* Event log */}
      <div className="p-3">
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
          Recent events{report.status === 'ok' ? ` (${rows.length})` : ''}
        </p>
        {initialLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading diagnostics...
          </div>
        ) : status === 'unavailable' ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Diagnostics backend is not deployed yet (IosPurchaseDiagnostic entity /
              record-ios-purchase-diagnostic function). The report appears here once they are
              deployed to Base44 and an iOS purchase attempt has been recorded.
            </p>
          </div>
        ) : status === 'error' && rows.length === 0 ? (
          <div className="flex items-center justify-between gap-2 py-1.5">
            <p className="text-xs text-destructive min-w-0 break-words">
              Failed to load diagnostics{report.message ? `: ${report.message}` : '.'}
            </p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-2 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:bg-primary/10 shrink-0 min-h-[44px]"
              aria-label="Retry loading iOS purchase diagnostics"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            No iOS subscription diagnostics recorded yet. Events appear after a subscription
            purchase attempt on a native iOS build.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 toolkit-scroll">
            {rows.map((row, idx) => {
              const details = parseDiagDetails(row.details_json);
              const productPlan = productPlanSummary(details);
              const entitlements = entitlementSummary(details);
              const errorText = errorSummary(details);
              return (
                <div
                  key={row.id || row.event_id || idx}
                  className="rounded-lg border border-border/30 bg-card/40 px-2.5 py-1.5 space-y-0.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_DOT[row.level] || LEVEL_DOT_FALLBACK}`}
                    />
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      {formatDateTime(row.occurred_at || row.created_date)}
                    </span>
                    <span className="text-[10px] font-mono text-foreground/80 truncate">
                      {row.event_name || '—'}
                    </span>
                    <span
                      className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${LEVEL_BADGE[row.level] || LEVEL_BADGE_FALLBACK}`}
                    >
                      {row.level || '—'}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground break-words">
                    session <span className="font-mono">{row.session_id || '—'}</span> ·{' '}
                    <span className="text-foreground/70">{row.outcome || '—'}</span> · user{' '}
                    <span className="font-mono">{row.user_id_hash || '—'}</span>
                  </p>
                  {productPlan && (
                    <p className="text-[10px] text-muted-foreground break-words">{productPlan}</p>
                  )}
                  {entitlements && (
                    <p className="text-[10px] text-muted-foreground break-words">
                      Entitlements: {entitlements}
                    </p>
                  )}
                  {errorText && (
                    <p className="text-[10px] text-destructive break-words">{errorText}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}