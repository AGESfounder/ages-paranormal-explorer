import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getEffectivePlanId } from '@/lib/access';

// Evidence save daily caps (must match server: spend-evidence-save)
export const EVIDENCE_FREE_DAILY_CAP = 10;   // Observer / Seeker (ad-watched)
export const EVIDENCE_PAID_DAILY_CAP = 20;   // Technician+ (free daily, then Aura)

/**
 * Returns today's evidence save count from the user record.
 * Resets to 0 if the saved date != today.
 */
function getDailySaveCount(user) {
  if (!user) return 0;
  const today = new Date().toISOString().split('T')[0];
  if (user.evidence_save_date !== today) return 0;
  return user.evidence_save_count || 0;
}

/**
 * Central evidence-save gating hook.
 *
 * Flow:
 *   Admin          → allowed immediately (free, unlimited)
 *   Observer       → if count < 10: show ad gate modal (promise-based);
 *                    if count >= 10: show UpgradePrompt (daily_cap)
 *   Seeker         → if count < 10: show ad gate modal (promise-based);
 *                    if count >= 10: call spend-evidence-save (aura_save_energy);
 *                    on energy_empty: show UpgradePrompt
 *   Technician+    → call spend-evidence-save server function;
 *                    on energy_empty: show UpgradePrompt
 *
 * Usage in Evidence.jsx:
 *   const { gateSave, dailyCount, dailyCap, showUpgrade, ... } = useEvidenceSaveGate();
 *   const allowed = await gateSave();
 *   if (!allowed) return;
 *   await base44.entities.Evidence.create(payload);
 */
export function useEvidenceSaveGate() {
  const [user, setUser] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [gateReason, setGateReason] = useState('plan'); // 'plan' | 'energy' | 'daily_cap'
  const [adGatePromise, setAdGatePromise] = useState(null); // { resolve, reject }

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Listen for ad reward events — refresh user state
  useEffect(() => {
    const handleAdReward = () => {
      base44.auth.me().then(setUser).catch(() => {});
    };
    window.addEventListener('ad-reward-granted', handleAdReward);
    return () => window.removeEventListener('ad-reward-granted', handleAdReward);
  }, []);

  const refreshUser = useCallback(async () => {
    const updated = await base44.auth.me().catch(() => null);
    if (updated) setUser(updated);
  }, []);

  const isAdmin = user?.role === 'admin';
  const planId = user ? getEffectivePlanId(user) : 'observer';
  const isFree = planId === 'observer' || planId === 'seeker';
  const dailyCap = isFree ? EVIDENCE_FREE_DAILY_CAP : EVIDENCE_PAID_DAILY_CAP;
  const dailyCount = getDailySaveCount(user);
  const dailyRemaining = Math.max(0, dailyCap - dailyCount);

  // Aura energy available for evidence saves (display only)
  const saveEnergy = user?.aura_save_energy || 0;
  const auraNarEnergy = user?.aura_narration_energy || 0;
  const auraManEnergy = user?.aura_manifestation_energy || 0;
  const auraSaveTotal = (planId === 'seeker' || planId === 'technician')
    ? saveEnergy
    : (auraNarEnergy + auraManEnergy);

  /**
   * Gate an evidence save. Returns true if allowed, false if blocked.
   * For Observer/Seeker under cap: shows the ad gate modal (promise-based).
   * For Technician+: calls the spend-evidence-save server function.
   * For Admin: returns true immediately.
   */
  const gateSave = useCallback(async () => {
    if (isAdmin) return true;
    if (!user) return false;

    // Observer: ad-watched saves with daily cap, blocked at cap
    if (planId === 'observer') {
      if (dailyCount >= dailyCap) {
        setGateReason('daily_cap');
        setShowUpgrade(true);
        return false;
      }
      // Show ad gate modal — wait for ad completion + server call
      return new Promise((resolve) => {
        setAdGatePromise({ resolve });
      });
    }

    // Seeker: ad-watched saves under cap, then Aura Save Energy over cap
    if (planId === 'seeker') {
      if (dailyCount < dailyCap) {
        // Under cap: show ad gate modal — wait for ad completion + server call
        return new Promise((resolve) => {
          setAdGatePromise({ resolve });
        });
      }
      // Over cap: fall through to server-authoritative spend (Aura Save Energy)
    }

    // Seeker (over cap) / Technician+: server-authoritative spend
    try {
      const res = await base44.functions.invoke('spend-evidence-save', {});
      if (res.data?.success) {
        await refreshUser();
        return true;
      }
      setGateReason(res.data?.reason === 'energy_empty' ? 'energy' : 'plan');
      setShowUpgrade(true);
      return false;
    } catch (e) {
      console.error('Evidence save gate error:', e);
      setGateReason('plan');
      setShowUpgrade(true);
      return false;
    }
  }, [isAdmin, user, isFree, dailyCount, dailyCap, refreshUser]);

  /**
   * Called by the EvidenceSaveAdGate modal after a successful ad watch +
   * server function call. Resolves the ad gate promise and refreshes user.
   */
  const onAdGateSuccess = useCallback(async () => {
    await refreshUser();
    setAdGatePromise(prev => {
      prev?.resolve(true);
      return null;
    });
  }, [refreshUser]);

  /**
   * Called by the EvidenceSaveAdGate modal when the user cancels or the
   * ad fails. Resolves the ad gate promise with false.
   */
  const onAdGateClose = useCallback(() => {
    setAdGatePromise(prev => {
      prev?.resolve(false);
      return null;
    });
  }, []);

  return {
    user,
    isAdmin,
    planId,
    isFree,
    dailyCount,
    dailyCap,
    dailyRemaining,
    auraSaveTotal,
    saveEnergy,
    auraNarEnergy,
    auraManEnergy,
    gateSave,
    showUpgrade,
    setShowUpgrade,
    gateReason,
    setGateReason,
    adGatePromise: adGatePromise !== null,
    onAdGateSuccess,
    onAdGateClose,
  };
}