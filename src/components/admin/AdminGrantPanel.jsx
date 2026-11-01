import React, { useState, useEffect, useCallback } from 'react';
import { Gift, Loader2, X, CalendarDays } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PLANS } from '@/lib/plans';

// Admin-only grant controls for one user: hand out a paid tier until a date, or
// end a grant early. Access is resolved from the purchase ledger, so a grant
// stops on its own at its expiration and a subscription underneath comes back.
const GRANTABLE = ['seeker', 'technician', 'explorer', 'investigator', 'trailblazer'];
const QUICK_DAYS = [7, 30, 90, 365];

function toDayString(date) {
  const d = new Date(date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDayString(d);
}

function formatDay(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isLive(grant, now = new Date()) {
  if (!grant || (grant.status !== 'active' && grant.status !== 'paid')) return false;
  const ms = grant.plan_expiration_date ? new Date(grant.plan_expiration_date).getTime() : NaN;
  return Number.isFinite(ms) && ms > now.getTime();
}

export default function AdminGrantPanel({ user, onChanged, flush = false }) {
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState('explorer');
  const [expiresOn, setExpiresOn] = useState(daysFromNow(30));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadGrants = useCallback(async () => {
    try {
      const rows = await base44.entities.RevenueCatPurchase.filter({
        user_id: user.id,
        store: 'ADMIN_GRANT',
      });
      const list = Array.isArray(rows) ? rows : rows?.items || [];
      setGrants(
        list
          .filter((r) => r && r.store === 'ADMIN_GRANT')
          .sort((a, b) => new Date(b.plan_expiration_date || 0) - new Date(a.plan_expiration_date || 0)),
      );
    } catch {
      setGrants([]);
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadGrants(); }, [loadGrants]);

  const handleGrant = async () => {
    if (busy) return;
    setError('');
    setMessage('');
    if (!expiresOn) {
      setError('Choose the date the access should end.');
      return;
    }
    // End of the chosen day, local time, so the last day is fully granted.
    const expiresAt = new Date(`${expiresOn}T23:59:59`);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      setError('The end date must be in the future.');
      return;
    }
    setBusy('grant');
    try {
      const res = await base44.functions.invoke('admin-grant-access', {
        action: 'grant',
        user_id: user.id,
        plan_id: planId,
        expires_at: expiresAt.toISOString(),
        note: note.trim(),
      });
      if (res?.data?.error) throw new Error(res.data.error);
      setNote('');
      setMessage(
        res?.data?.preserved_higher_plan
          ? 'Saved. This account already holds a higher active plan, so its display is unchanged.'
          : `Granted ${PLANS[planId]?.name || planId} until ${formatDay(expiresAt)}.`,
      );
      await loadGrants();
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Grant failed.');
    }
    setBusy('');
  };

  const handleRevoke = async (grant) => {
    if (busy) return;
    setError('');
    setMessage('');
    setBusy(grant.id);
    try {
      const res = await base44.functions.invoke('admin-grant-access', {
        action: 'revoke',
        grant_id: grant.id,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      const plan = res?.data?.plan_id;
      setMessage(
        plan && plan !== 'observer'
          ? `Revoked. Back to ${PLANS[plan]?.name || plan}.`
          : 'Revoked. Back to Observer.',
      );
      await loadGrants();
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Revoke failed.');
    }
    setBusy('');
  };

  return (
    <div className={`space-y-2 ${flush ? '' : 'border-t border-border/20 pt-2 mt-1'}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Gift className="w-3 h-3" /> Subscription Grant
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
        </div>
      ) : grants.length > 0 ? (
        <div className="space-y-1.5">
          {grants.map((g) => {
            const live = isLive(g);
            const grantedPlan = String(g.product_id || '').replace('admin_grant.', '');
            return (
              <div key={g.id} className="flex items-start justify-between gap-2 text-xs py-1.5 px-2 rounded bg-card/30">
                <div className="min-w-0">
                  <p className={`truncate ${live ? 'text-emerald-300' : 'text-foreground'}`}>
                    {PLANS[grantedPlan]?.name || grantedPlan || 'Grant'}
                    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${live ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' : 'bg-muted/20 text-muted-foreground border-muted-foreground/30'}`}>
                      {live ? 'active' : 'ended'}
                    </span>
                  </p>
                  <p className={`text-[10px] flex items-center gap-1 ${live ? 'text-emerald-300/90' : 'text-muted-foreground'}`}>
                    <CalendarDays className="w-2.5 h-2.5" />
                    Ends {formatDay(g.plan_expiration_date)}
                  </p>
                  {g.grant_note && (
                    <p className="text-[10px] text-muted-foreground/80 break-words">{g.grant_note}</p>
                  )}
                </div>
                {live && (
                  <button
                    onClick={() => handleRevoke(g)}
                    disabled={Boolean(busy)}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 shrink-0"
                  >
                    {busy === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />} Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-1">No admin grants on this account.</p>
      )}

      <div className="space-y-2 rounded-lg border border-border/30 bg-card/20 p-2">
        <div className="flex flex-wrap gap-1.5">
          {GRANTABLE.map((id) => (
            <button
              key={id}
              onClick={() => setPlanId(id)}
              className={`text-[10px] px-2 py-1 rounded border uppercase tracking-wider transition-colors ${planId === id ? 'bg-primary/20 text-primary border-primary/50' : 'border-border/40 text-muted-foreground hover:text-foreground'}`}
            >
              {PLANS[id]?.name || id}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setExpiresOn(daysFromNow(d))}
              className="text-[10px] px-2 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground"
            >
              {d === 365 ? '1 year' : `${d} days`}
            </button>
          ))}
          <Input
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className="h-8 w-[9.5rem] bg-card/50 border-border/40 text-xs"
          />
        </div>

        <Input
          placeholder="Note (e.g. contest winner, October)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={240}
          className="h-8 bg-card/50 border-border/40 text-xs"
        />

        <Button size="sm" onClick={handleGrant} disabled={Boolean(busy)} className="w-full h-8 text-xs">
          {busy === 'grant' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Grant ${PLANS[planId]?.name || planId}`}
        </Button>

        {message && <p className="text-[11px] text-emerald-300">{message}</p>}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    </div>
  );
}