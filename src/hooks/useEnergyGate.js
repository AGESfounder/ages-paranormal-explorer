import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

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
  const isPaid = isAdmin || (user?.plan && user.plan !== 'observer');
  const manEnergy = user?.manifestation_energy || 0;
  const auraManEnergy = user?.aura_manifestation_energy || 0;
  const narEnergy = user?.narration_energy || 0;
  const auraNarEnergy = user?.aura_narration_energy || 0;

  const estimateNarrationCost = useCallback((text) => {
    return Math.min(100, Math.max(1, Math.ceil((text || '').length / 50)));
  }, []);

  const canManifest = useCallback(() => {
    if (isAdmin) return true;
    return isPaid && (manEnergy > 0 || auraManEnergy > 0);
  }, [isAdmin, isPaid, manEnergy, auraManEnergy]);

  const canNarrate = useCallback((text) => {
    if (isAdmin) return true;
    if (!isPaid) return false;
    const cost = estimateNarrationCost(text);
    return (narEnergy + auraNarEnergy) >= cost;
  }, [isAdmin, isPaid, narEnergy, auraNarEnergy, estimateNarrationCost]);

  const spendManifestation = useCallback(async () => {
    if (isAdmin) return; // Admins don't spend energy
    let newMan = manEnergy;
    let newAura = auraManEnergy;
    if (newMan > 0) newMan -= 1;
    else if (newAura > 0) newAura -= 1;
    try {
      await base44.auth.updateMe({ manifestation_energy: newMan, aura_manifestation_energy: newAura });
      setUser(prev => ({ ...prev, manifestation_energy: newMan, aura_manifestation_energy: newAura }));
    } catch (e) { console.error('Failed to update manifestation energy:', e); }
  }, [isAdmin, manEnergy, auraManEnergy]);

  const spendNarration = useCallback(async (cost) => {
    if (isAdmin) return; // Admins don't spend energy
    let newNar = narEnergy;
    let newAura = auraNarEnergy;
    if (newNar >= cost) newNar -= cost;
    else { const rem = cost - newNar; newNar = 0; newAura = Math.max(0, newAura - rem); }
    try {
      await base44.auth.updateMe({ narration_energy: newNar, aura_narration_energy: newAura });
      setUser(prev => ({ ...prev, narration_energy: newNar, aura_narration_energy: newAura }));
    } catch (e) { console.error('Failed to update narration energy:', e); }
  }, [isAdmin, narEnergy, auraNarEnergy]);

  // Gate a manifestation (InvokeLLM) action. Returns true if allowed.
  // If blocked, shows the upgrade prompt automatically.
  const gateManifestation = useCallback(() => {
    if (isAdmin) return true;
    if (!isPaid) { setGateReason('plan'); setShowUpgrade(true); return false; }
    if (manEnergy <= 0 && auraManEnergy <= 0) { setGateReason('energy'); setShowUpgrade(true); return false; }
    return true;
  }, [isAdmin, isPaid, manEnergy, auraManEnergy]);

  // Gate a narration (GenerateSpeech) action. Returns true if allowed.
  const gateNarration = useCallback((text) => {
    if (isAdmin) return true;
    if (!isPaid) { setGateReason('plan'); setShowUpgrade(true); return false; }
    const cost = estimateNarrationCost(text);
    if (narEnergy + auraNarEnergy < cost) { setGateReason('energy'); setShowUpgrade(true); return false; }
    return true;
  }, [isAdmin, isPaid, narEnergy, auraNarEnergy, estimateNarrationCost]);

  return {
    user, isPaid,
    manEnergy, auraManEnergy, narEnergy, auraNarEnergy,
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
    const isPaid = user?.plan && user.plan !== 'observer';
    if (!isPaid) return { allowed: false, reason: 'plan' };
    const manE = user?.manifestation_energy || 0;
    const auraManE = user?.aura_manifestation_energy || 0;
    if (manE <= 0 && auraManE <= 0) return { allowed: false, reason: 'energy' };
    return { allowed: true };
  } catch (e) {
    return { allowed: false, reason: 'plan' };
  }
}

export async function spendManifestationEnergy() {
  try {
    const user = await base44.auth.me();
    if (user?.role === 'admin') return; // Admins don't spend energy
    let newMan = user?.manifestation_energy || 0;
    let newAura = user?.aura_manifestation_energy || 0;
    if (newMan > 0) newMan -= 1;
    else if (newAura > 0) newAura -= 1;
    await base44.auth.updateMe({ manifestation_energy: newMan, aura_manifestation_energy: newAura });
  } catch (e) { console.error('Failed to spend manifestation energy:', e); }
}