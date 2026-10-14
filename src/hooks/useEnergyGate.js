import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { withAppleLedger } from '@/lib/appleLedger';
import { isPaidAccess, canGenerate, getSpendableEnergy } from '@/lib/access';

// A fresh id per spend. The server records the id with the deduction, so a
// retried request can never spend twice while a new action always gets a new one.
function newRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
import useAppResumeRefresh from '@/hooks/useAppResumeRefresh';

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

  // Every user refresh goes through withAppleLedger so plan/energy gates
  // resolve the same ledger-aware effective plan as the backend
  // (fail-soft: bare user on any ledger fetch error).
  const refreshUser = useCallback(() => {
    return base44.auth.me()
      .then(async (u) => setUser(await withAppleLedger(u)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Re-read when the app comes back to the foreground: a plan can lapse, renew or
  // be refunded while it sits in the background, and a gate must decide on the
  // subscription state the server has now.
  useAppResumeRefresh(refreshUser);

  // Listen for ad reward events — refresh user state so earned energy is
  // immediately usable without a page reload.
  useEffect(() => {
    const handleAdReward = () => { refreshUser(); };
    window.addEventListener('ad-reward-granted', handleAdReward);
    return () => window.removeEventListener('ad-reward-granted', handleAdReward);
  }, [refreshUser]);

  const isAdmin = user?.role === 'admin';
  // Honors generic plan_expiration_date AND isolated Google Trailblazer expiry
  const isPaid = isPaidAccess(user);
  // Explorer+ can generate tours (Nearby/Abroad). Seeker/Technician cannot.
  const canGen = canGenerate(user);
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

  // Energy is deducted on the SERVER (spend-energy) and nowhere else: a User
  // record's custom fields are writable by their own owner, so a balance written
  // from here could simply be edited to add energy. The server resolves the plan
  // from the purchase ledger, deducts from the server-owned energy account with a
  // guarded update (two concurrent requests cannot spend the same unit, and a
  // balance cannot go below zero), then mirrors the result onto the record this
  // hook displays.
  const spendOnServer = useCallback(async (payload) => {
    try {
      const res = await base44.functions.invoke('spend-energy', payload);
      if (res?.data?.ok) {
        await refreshUser();
        return true;
      }
      // Out of energy, or the plan could not be verified on the server: say which
      // rather than failing silently, then re-read so the display matches.
      setGateReason(res?.data?.reason === 'insufficient' ? 'energy' : 'plan');
      setShowUpgrade(true);
      await refreshUser();
      return false;
    } catch (e) {
      console.error('Energy spend failed:', e);
      return false;
    }
  }, [refreshUser]);

  const spendManifestation = useCallback(async () => {
    if (isAdmin) return; // Admins don't spend energy
    await spendOnServer({ kind: 'manifestation', request_id: newRequestId() });
  }, [isAdmin, spendOnServer]);

  const spendNarration = useCallback(async (cost) => {
    if (isAdmin) return; // Admins don't spend energy
    await spendOnServer({ kind: 'narration', cost, request_id: newRequestId() });
  }, [isAdmin, spendOnServer]);

  // Gate a manifestation (InvokeLLM) action. Returns true if allowed.
  // If blocked, shows the upgrade prompt automatically.
  const gateManifestation = useCallback(() => {
    if (isAdmin) return true;
    // No user record read yet, or nothing readable: the subscription status
    // cannot be verified, so paid access is not granted and the prompt says so
    // rather than claiming the user has no plan.
    if (!user) { setGateReason('unverified'); setShowUpgrade(true); return false; }
    if (!isPaid) { setGateReason('plan'); setShowUpgrade(true); return false; }
    if (totalMan <= 0) { setGateReason('energy'); setShowUpgrade(true); return false; }
    return true;
  }, [isAdmin, isPaid, totalMan, user]);

  // Gate a tour-generation action (Nearby/Abroad). Only Explorer+ may generate.
  const gateGeneration = useCallback(() => {
    if (isAdmin) return true;
    if (!user) { setGateReason('unverified'); setShowUpgrade(true); return false; }
    if (!canGen) { setGateReason('plan'); setShowUpgrade(true); return false; }
    if (totalMan <= 0) { setGateReason('energy'); setShowUpgrade(true); return false; }
    return true;
  }, [isAdmin, canGen, totalMan, user]);

  // Gate a narration (GenerateSpeech) action. Returns true if allowed.
  const gateNarration = useCallback((text) => {
    if (isAdmin) return true;
    if (!user) { setGateReason('unverified'); setShowUpgrade(true); return false; }
    if (!isPaid) { setGateReason('plan'); setShowUpgrade(true); return false; }
    const cost = estimateNarrationCost(text);
    if (totalNar < cost) { setGateReason('energy'); setShowUpgrade(true); return false; }
    return true;
  }, [isAdmin, isPaid, totalNar, estimateNarrationCost, user]);

  return {
    user, isPaid,
    manEnergy: Math.max(0, manEnergy), auraManEnergy,
    narEnergy: Math.max(0, narEnergy), auraNarEnergy,
    canManifest, canNarrate, estimateNarrationCost,
    spendManifestation, spendNarration,
    gateManifestation, gateGeneration, gateNarration,
    showUpgrade, setShowUpgrade, gateReason, setGateReason,
  };
}

// Standalone helpers for auto-fire actions (outside React render cycle).
// Use these when you can't use the hook (e.g. inside async functions called
// from useEffect where the hook's user state may not be loaded yet).

export async function checkManifestationGate() {
  try {
    const user = await withAppleLedger(await base44.auth.me());
    if (!user) return { allowed: false, reason: 'auth', message: 'Sign in to generate detailed stop content.' };
    if (user?.role === 'admin') return { allowed: true, reason: null };
    if (!isPaidAccess(user)) {
      return {
        allowed: false,
        reason: 'plan',
        message: 'Detailed stop generation requires an Investigator plan or higher.',
      };
    }
    const { manifestation } = getSpendableEnergy(user);
    if (manifestation <= 0) {
      return {
        allowed: false,
        reason: 'energy',
        message: 'You are out of manifestation energy. Earn more with a rewarded ad or wait for your monthly refill.',
      };
    }
    return { allowed: true, reason: null };
  } catch (e) {
    return {
      allowed: false,
      reason: 'network',
      message: 'Could not verify your plan or energy. Check your connection and try again.',
    };
  }
}

export async function spendManifestationEnergy() {
  try {
    const user = await base44.auth.me();
    if (user?.role === 'admin') return; // Admins don't spend energy
    // One unit, deducted server-side — see spendOnServer above for why the client
    // must never write an energy balance itself.
    await base44.functions.invoke('spend-energy', {
      kind: 'manifestation',
      request_id: newRequestId(),
    });
  } catch (e) { console.error('Failed to spend manifestation energy:', e); }
}