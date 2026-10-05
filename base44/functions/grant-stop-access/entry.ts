import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isPaidAccess } from '../../shared/access.js';
import { getTodayDateString } from '../../shared/adRewards.js';
import { STOP_AD_DAILY_CAP } from '../../shared/stopAdGate.js';

// Grants paranormal-stop content access to an Observer user after they watch
// a rewarded ad. The daily cap (10/day) is enforced server-side to push upgrades
// and prevent unlimited ad farming. Seeker+ and admins are ad-free.
//
// Called from the AdGate component after a rewarded ad completes. The client
// never writes stop_ad_views_count directly — only this function does.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Paid users and admins are ad-free — no gate, no count
    if (isPaidAccess(user)) {
      return Response.json({ success: true, adFree: true, remaining: null });
    }

    const today = getTodayDateString();
    let countToday = user.stop_ad_views_count || 0;
    // Reset counter if it's a new day
    if (user.stop_ad_views_date !== today) {
      countToday = 0;
    }

    // Enforce daily cap
    if (countToday >= STOP_AD_DAILY_CAP) {
      return Response.json(
        { error: 'Daily stop ad limit reached', remaining: 0, cap: STOP_AD_DAILY_CAP },
        { status: 429 }
      );
    }

    const newCount = countToday + 1;
    await base44.asServiceRole.entities.User.update(user.id, {
      stop_ad_views_count: newCount,
      stop_ad_views_date: today,
    });

    console.log('Stop ad access granted to user:', user.id, 'count today:', newCount);

    return Response.json({
      success: true,
      remaining: STOP_AD_DAILY_CAP - newCount,
      countToday: newCount,
      cap: STOP_AD_DAILY_CAP,
    });
  } catch (error) {
    console.error('grant-stop-access error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}