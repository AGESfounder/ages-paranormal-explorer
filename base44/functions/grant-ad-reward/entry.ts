import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  AD_REWARD_DAILY_LIMIT,
  getAdRewardSplit,
  getTodayDateString,
} from '../../shared/adRewards.js';
import { resolveTrustedEntitlement } from '../../shared/entitlement.js';
import { loadEnergyAccount, grantEnergy, adCountToday } from '../../shared/energy.js';

// Grants energy to a paid user after they watch a rewarded ad.
// The daily cap (5/day) is enforced server-side to prevent farming.
// Energy is added to the aura (rollover) pool so it survives monthly resets.
//
// SECURITY NOTE: In web preview this is called directly by the client after a
// simulated ad. When you ship on Capacitor with AdMob Server-Side Verification,
// configure AdMob to call this endpoint with a verified SSV callback instead of
// the client — the grant logic below stays the same.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Only paid users (or admins) can earn ad rewards. Paid status is resolved
    // from the purchase ledger with the shared trusted resolver — the user-readable
    // plan fields are a display mirror that its owner can edit, so they decide
    // nothing here.
    const entitlement = await resolveTrustedEntitlement(base44, user);
    if (!entitlement.isPaid) {
      return Response.json(
        { error: 'Ad rewards are available for paid plans only' },
        { status: 403 }
      );
    }

    // The daily counter lives on the server-owned energy account, not on the user
    // record: a counter its owner can reset would make the 5/day cap meaningless.
    const today = getTodayDateString();
    const account = await loadEnergyAccount(base44, user, entitlement);
    const countToday = adCountToday(account, today);

    // Enforce daily cap
    if (countToday >= AD_REWARD_DAILY_LIMIT) {
      return Response.json(
        { error: 'Daily ad reward limit reached', remaining: 0 },
        { status: 429 }
      );
    }

    // Grant energy to the Aura (rollover) pool — 80% narration, 20% manifestation.
    // Atomic increments on the account, which also re-writes the record's mirror.
    const split = getAdRewardSplit();
    const newCount = countToday + 1;

    const updated = await grantEnergy(
      base44,
      user.id,
      { aura_narration: split.narration, aura_manifestation: split.manifestation },
      { ad_count: newCount, ad_date: today },
    );

    console.log('Ad reward granted to user:', user.id, 'count today:', newCount);

    return Response.json({
      success: true,
      granted: { narration: split.narration, manifestation: split.manifestation },
      remaining: AD_REWARD_DAILY_LIMIT - newCount,
      aura_narration_energy: Number(updated?.aura_narration) || 0,
      aura_manifestation_energy: Number(updated?.aura_manifestation) || 0,
    });
  } catch (error) {
    console.error('grant-ad-reward error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}