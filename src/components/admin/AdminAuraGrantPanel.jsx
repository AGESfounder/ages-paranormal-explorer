import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AURA_BUNDLES } from '@/lib/plans';

// Admin-only Aura energy grant: picks one Aura bundle and adds its energy to the
// account's balances. The pool split matches a real purchase (Seeker/Technician
// go to save energy, higher tiers split narration/manifestation), so the server
// reports what actually landed.
const BUNDLE_IDS = ['flicker', 'apparition', 'haunting', 'spectral'];

export default function AdminAuraGrantPanel({ user, onChanged, flush = false }) {
  const [bundleId, setBundleId] = useState('apparition');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const balances = [
    ['Narration', user.aura_narration_energy],
    ['Manifestation', user.aura_manifestation_energy],
    ['Save', user.aura_save_energy],
  ];

  const handleGrant = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await base44.functions.invoke('admin-grant-access', {
        action: 'grant_aura',
        user_id: user.id,
        bundle_id: bundleId,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      const granted = res?.data?.granted || {};
      const parts = [
        granted.aura_narration ? `${granted.aura_narration} narration` : null,
        granted.aura_manifestation ? `${granted.aura_manifestation} manifestation` : null,
        granted.aura_save ? `${granted.aura_save} save` : null,
      ].filter(Boolean);
      setMessage(`Granted ${parts.join(' + ')} energy.`);
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Aura grant failed.');
    }
    setBusy(false);
  };

  return (
    <div className={`space-y-2 ${flush ? '' : 'border-t border-border/20 pt-2 mt-1'}`}>
      <p className="text-[11px] uppercase tracking-wider font-bold text-white flex items-center justify-center gap-1">
        <Sparkles className="w-3 h-3" /> Aura Energy Grant
      </p>

      <p className="text-[10px] text-muted-foreground">
        Balances: {balances.map(([label, value]) => `${label} ${Number(value) || 0}`).join(' · ')}
      </p>

      <div className="flex items-center gap-1.5">
        <select
          value={bundleId}
          onChange={(e) => setBundleId(e.target.value)}
          aria-label="Aura energy amount"
          className="flex-1 min-w-0 h-8 rounded-md border border-border/40 bg-card/50 px-2 text-xs text-foreground"
        >
          {BUNDLE_IDS.map((id) => (
            <option key={id} value={id}>
              {AURA_BUNDLES[id].icon} {AURA_BUNDLES[id].name} — {AURA_BUNDLES[id].energy.toLocaleString()} energy
            </option>
          ))}
        </select>
        <Button size="sm" onClick={handleGrant} disabled={busy} className="h-8 text-xs px-3 shrink-0">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Grant'}
        </Button>
      </div>

      {message && <p className="text-[11px] text-emerald-300">{message}</p>}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}