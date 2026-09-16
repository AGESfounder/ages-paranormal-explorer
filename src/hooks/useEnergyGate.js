import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  isPaidAccess,
  getSpendableEnergy,
  applyManifestationSpend,
  applyNarrationSpend,
} from '@/lib/access';

/**
 * Central energy-gating hook. Checks the user's subscription plan and energy
 * levels before any credit-consuming action (InvokeLLM or GenerateSpeech).
 *
 * Usage patterns:
 *
 * 1. User-triggered action (narration button, create tour, weather):
 *    const { gateManifestation, spendManifestation, showUpgrade, setShowUpgrade, gateReason } = useEnergyGate();
 *    if (!gateManifestation()) return;  // shows upgrade prompt automatically
 *    await callJson(prompt);
 *    spendManifestation();
 *
 * 2. Auto-fire action (stop enrichment, people extraction):
 *    const { isPaid, canManifest, spendManifestation } = useEnergyGate();
 *    if (!isPaid || !canManifest()) return;  // skip silently
 *
 * 3. Narration:
 *    const { gateNarration, spendNarration, estimateNarrationCost } = useEnergyGate();
 *    if (!gateNarration(text)) return;
 *    narrate(text);
 *    spendNarration(estimateNarrationCost(text));
 */
export function useEnergyGate() {
  const [user, setUser] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [gateReason, setGateReason] = useState('plan'); // 'plan' or 'energy'

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Listen for ad reward events — refresh user state so earned energy is
  // immediately usable without a page reload.
  useEffect(() => {
    const handleAdReward = () => {
      base44.auth.me().then(setUser).catch(() => {});
    };
    window.addEventListener('ad-reward-granted', handleAdReward);
    return () => window.removeEventListener('ad-reward-granted', handleAdReward);
  }, []);

  const isAdmin = user?.role === 'admin';
  // Honors generic plan_expiration_date AND isolated Google Trailblazer expiry
  const isPaid = isPaidAccess(user);
  const spendable = getSpendableEnergy(user);
  const manEnergy = spendable.manifestation - (user?.aura_manifestation_energy || 0);
  const auraManEnergy = user?.aura_manifestation_energy || 0;
  const narEnergy = spendable.narration - (user?.aura_narration_energy || 0);
  const auraNarEnergy = user?.aura_narration_energy || 0;
  // Display/gate totals include monthly (all active sources) + aura
  const totalMan = spendable.manifestation;
  const totalNar = spendable.narration;

  const estimateNarrationCost = useCallback((text) => {
    return Math.min(100, Math.max(1, Math.ceil((text || '').length / 50)));
  }, []);

  const canManifest = useCallback(() => {
    if (isAdmin) return true;
    return isPaid && totalMan > 0;
  }, [isAdmin, isPaid, totalMan]);

  const canNarrate = useCallback((text) => {
    if (isAdmin) return true;
    if (!isPaid) return false;
    const cost = estimateNarrationCost(text);
    return totalNar >= cost;
  }, [isAdmin, isPaid, totalNar, estimateNarrationCost]);

  const spendManifestation = useCallback(async () => {
    if (isAdmin) return; // Admins don't spend energy
    const { updates, next } = applyManifestationSpend(user);
    if (Object.keys(updates).length === 0) return;
    try {
      await base44.auth.updateMe(updates);
      setUser(prev => ({ ...prev, ...next }));
    } catch (e) { console.error('Failed to update manifestation energy:', e); }
  }, [isAdmin, user]);

  const spendNarration = useCallback(async (cost) => {
    if (isAdmin) return; // Admins don't spend energy
    const { updates, next } = applyNarrationSpend(user, cost);
    if (Object.keys(updates).length === 0) return;
    try {
      await base44.auth.updateMe(updates);
      setUser(prev => ({ ...prev, ...next }));
    } catch (e) { console.error('Failed to update narration energy:', e); }
  }, [isAdmin, user]);

  // Gate a manifestation (InvokeLLM) action. Returns true if allowed.
  // If blocked, shows the upgrade prompt automatically.
  const gateManifestation = useCallback(() => {
    if (isAdmin) return true;
    if (!isPaid) { setGateReason('plan'); setShowUpgrade(true); return false; }
    if (totalMan <= 0) { setGateReason('energy'); setShowUpgrade(true); return false; }
    return true;
  }, [isAdmin, isPaid, totalMan]);

  // Gate a narration (GenerateSpeech) action. Returns true if allowed.
  const gateNarration = useCallback((text) => {
    if (isAdmin) return true;
    if (!isPaid) { setGateReason('plan'); setShowUpgrade(true); return false; }
    const cost = estimateNarrationCost(text);
    if (totalNar < cost) { setGateReason('energy'); setShowUpgrade(true); return false; }
    return true;
  }, [isAdmin, isPaid, totalNar, estimateNarrationCost]);

  return {
    user, isPaid,
    manEnergy: Math.max(0, manEnergy), auraManEnergy,
    narEnergy: Math.max(0, narEnergy), auraNarEnergy,
    canManifest, canNarrate, estimateNarrationCost,
    spendManifestation, spendNarration,
    gateManifestation, gateNarration,
    showUpgrade, setShowUpgrade, gateReason,
  };
}

// Standalone helpers for auto-fire actions (outside React render cycle).
// Use these when you can't use the hook (e.g. inside async functions called
// from useEffect where the hook's user state may not be loaded yet).

export async function checkManifestationGate() {
  try {
    const user = await base44.auth.me();
    if (user?.role === 'admin') return { allowed: true };
    if (!isPaidAccess(user)) return { allowed: false, reason: 'plan' };
    const { manifestation } = getSpendableEnergy(user);
    if (manifestation <= 0) return { allowed: false, reason: 'energy' };
    return { allowed: true };
  } catch (e) {
    return { allowed: false, reason: 'plan' };
  }
}

export async function spendManifestationEnergy() {
  try {
    const user = await base44.auth.me();
    if (user?.role === 'admin') return; // Admins don't spend energy
    const { updates } = applyManifestationSpend(user);
    if (Object.keys(updates).length === 0) return;
    await base44.auth.updateMe(updates);
  } catch (e) { console.error('Failed to spend manifestation energy:', e); }
}