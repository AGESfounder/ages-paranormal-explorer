// Client effective plan / paid-access helpers.
// Mirrors base44/shared/access.js so gates honor Apple/Wix expiry and the
// isolated Google Trailblazer 30-month grant. Source of truth for grants is
// the Base44 user record (webhook-written); never grant from RevenueCat SDK.

import { PLANS } from '@/lib/plans';

const PLAN_RANK = {
  observer: 0,
  explorer: 1,
  investigator: 2,
  trailblazer: 3,
};

export function isDateActive(isoDate, now = new Date()) {
  if (!isoDate) return false;
  const ms = new Date(isoDate).getTime();
  if (Number.isNaN(ms)) return false;
  return ms > now.getTime();
}

/**
 * Generic (Apple/Wix) plan is active when plan is paid and either has no
 * expiration or the expiration is still in the future.
 */
export function isGenericPlanActive(user, now = new Date()) {
  if (!user) return false;
  const plan = user.plan || 'observer';
  if (plan === 'observer') return false;

  if (user.plan_expiration_date) {
    return isDateActive(user.plan_expiration_date, now);
  }

  if (user.subscription_status === 'canceled' || user.subscription_status === 'expired') {
    return false;
  }

  return true;
}

/** Isolated Google Trailblazer grant is active while its expiry is in the future. */
export function isGoogleTrailblazerActive(user, now = new Date()) {
  if (!user) return false;
  return isDateActive(user.google_trailblazer_expiration_date, now);
}

export function getEffectivePlanId(user, now = new Date()) {
  if (!user) return 'observer';
  if (user.role === 'admin') {
    return user.plan && user.plan !== 'observer' ? user.plan : 'trailblazer';
  }

  let best = 'observer';

  if (isGenericPlanActive(user, now)) {
    best = user.plan || 'observer';
  }

  if (isGoogleTrailblazerActive(user, now)) {
    if ((PLAN_RANK.trailblazer || 0) >= (PLAN_RANK[best] || 0)) {
      best = 'trailblazer';
    }
  }

  return best;
}

export function isPaidAccess(user, now = new Date()) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return getEffectivePlanId(user, now) !== 'observer';
}

export function getEffectivePlan(user, now = new Date()) {
  const id = getEffectivePlanId(user, now);
  return PLANS[id] || PLANS.observer;
}

export function getEnergySource(user, now = new Date()) {
  if (isGoogleTrailblazerActive(user, now)) return 'google';
  if (isGenericPlanActive(user, now)) return 'generic';
  return 'none';
}

export function getDisplayEnergy(user, now = new Date()) {
  const source = getEnergySource(user, now);
  const auraMan = user?.aura_manifestation_energy || 0;
  const auraNar = user?.aura_narration_energy || 0;

  if (source === 'google') {
    return {
      source,
      manifestation: user?.google_trailblazer_manifestation_energy || 0,
      narration: user?.google_trailblazer_narration_energy || 0,
      auraManifestation: auraMan,
      auraNarration: auraNar,
      resetDate: user?.google_trailblazer_energy_reset_date || null,
    };
  }

  if (source === 'generic') {
    return {
      source,
      manifestation: user?.manifestation_energy || 0,
      narration: user?.narration_energy || 0,
      auraManifestation: auraMan,
      auraNarration: auraNar,
      resetDate: user?.energy_reset_date || null,
    };
  }

  return {
    source: 'none',
    manifestation: 0,
    narration: 0,
    auraManifestation: auraMan,
    auraNarration: auraNar,
    resetDate: null,
  };
}

export function getSpendableEnergy(user, now = new Date()) {
  const googleActive = isGoogleTrailblazerActive(user, now);
  const genericActive = isGenericPlanActive(user, now);

  let man = 0;
  let nar = 0;

  if (googleActive) {
    man += user?.google_trailblazer_manifestation_energy || 0;
    nar += user?.google_trailblazer_narration_energy || 0;
  }
  if (genericActive) {
    man += user?.manifestation_energy || 0;
    nar += user?.narration_energy || 0;
  }

  man += user?.aura_manifestation_energy || 0;
  nar += user?.aura_narration_energy || 0;

  return { manifestation: man, narration: nar, googleActive, genericActive };
}

export function applyManifestationSpend(user, now = new Date()) {
  const updates = {};
  let gMan = user?.google_trailblazer_manifestation_energy || 0;
  let man = user?.manifestation_energy || 0;
  let aura = user?.aura_manifestation_energy || 0;

  if (isGoogleTrailblazerActive(user, now) && gMan > 0) {
    gMan -= 1;
    updates.google_trailblazer_manifestation_energy = gMan;
  } else if (isGenericPlanActive(user, now) && man > 0) {
    man -= 1;
    updates.manifestation_energy = man;
  } else if (aura > 0) {
    aura -= 1;
    updates.aura_manifestation_energy = aura;
  }

  return {
    updates,
    next: {
      ...user,
      google_trailblazer_manifestation_energy: gMan,
      manifestation_energy: man,
      aura_manifestation_energy: aura,
    },
  };
}

export function applyNarrationSpend(user, cost, now = new Date()) {
  let remaining = Math.max(0, Number(cost) || 0);
  let gNar = user?.google_trailblazer_narration_energy || 0;
  let nar = user?.narration_energy || 0;
  let aura = user?.aura_narration_energy || 0;
  const updates = {};

  if (remaining > 0 && isGoogleTrailblazerActive(user, now) && gNar > 0) {
    const take = Math.min(gNar, remaining);
    gNar -= take;
    remaining -= take;
    updates.google_trailblazer_narration_energy = gNar;
  }

  if (remaining > 0 && isGenericPlanActive(user, now) && nar > 0) {
    const take = Math.min(nar, remaining);
    nar -= take;
    remaining -= take;
    updates.narration_energy = nar;
  }

  if (remaining > 0 && aura > 0) {
    const take = Math.min(aura, remaining);
    aura -= take;
    remaining -= take;
    updates.aura_narration_energy = aura;
  }

  return {
    updates,
    remaining,
    next: {
      ...user,
      google_trailblazer_narration_energy: gNar,
      narration_energy: nar,
      aura_narration_energy: aura,
    },
  };
}

export function getEffectiveExpirationDate(user, now = new Date()) {
  const dates = [];
  if (isGoogleTrailblazerActive(user, now) && user.google_trailblazer_expiration_date) {
    dates.push(user.google_trailblazer_expiration_date);
  }
  if (isGenericPlanActive(user, now) && user.plan_expiration_date) {
    dates.push(user.plan_expiration_date);
  }
  if (dates.length === 0) return null;

  let max = null;
  for (const d of dates) {
    const ms = new Date(d).getTime();
    if (Number.isNaN(ms)) continue;
    if (max === null || ms > max) max = ms;
  }
  return max === null ? null : new Date(max).toISOString();
}