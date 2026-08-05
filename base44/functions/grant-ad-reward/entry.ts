import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  AD_REWARD_DAILY_LIMIT,
  getAdRewardSplit,
  getTodayDateString,
} from '../../shared/adRewards.js';

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

    // Only paid users (or admins) can earn ad rewards
    const isPaid = user.role === 'admin' || (user.plan && user.plan !== 'observer');
    if (!isPaid) {
      return Response.json(
        { error: 'Ad rewards are available for paid plans only' },
        { status: 403 }
      );
    }

    const today = getTodayDateString();
    let countToday = user.ad_rewards_count || 0;
    // Reset counter if it's a new day
    if (user.ad_rewards_date !== today) {
      countToday = 0;
    }

    // Enforce daily cap
    if (countToday >= AD_REWARD_DAILY_LIMIT) {
      return Response.json(
        { error: 'Daily ad reward limit reached', remaining: 0 },
        { status: 429 }
      );
    }

    // Grant energy to aura (rollover) pool — 80% narration, 20% manifestation
    const split = getAdRewardSplit();
    const newAuraNar = (user.aura_narration_energy || 0) + split.narration;
    const newAuraMan = (user.aura_manifestation_energy || 0) + split.manifestation;
    const newCount = countToday + 1;

    await base44.asServiceRole.entities.User.update(user.id, {
      aura_narration_energy: newAuraNar,
      aura_manifestation_energy: newAuraMan,
      ad_rewards_count: newCount,
      ad_rewards_date: today,
    });

    console.log('Ad reward granted to user:', user.id, 'count today:', newCount);

    return Response.json({
      success: true,
      granted: { narration: split.narration, manifestation: split.manifestation },
      remaining: AD_REWARD_DAILY_LIMIT - newCount,
      aura_narration_energy: newAuraNar,
      aura_manifestation_energy: newAuraMan,
    });
  } catch (error) {
    console.error('grant-ad-reward error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}