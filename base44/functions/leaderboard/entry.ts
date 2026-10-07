import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all investigations and all users via service role
    const [investigations, users] = await Promise.all([
      base44.asServiceRole.entities.Investigation.list(),
      base44.asServiceRole.entities.User.list(),
    ]);

    console.log('LB investigations:', Array.isArray(investigations) ? investigations.length : 'not-array', 'users:', Array.isArray(users) ? users.length : 'not-array');
    console.log('LB sample user fields:', JSON.stringify(users?.[2] ? { id: users[2].id, role: users[2].role, plan: users[2].plan, sub: users[2].subscription_status, exp: users[2].plan_expiration_date } : 'none'));

    // Count completed investigations per user
    const counts = {};
    for (const inv of investigations) {
      if (!inv.created_by_id) continue;
      counts[inv.created_by_id] = (counts[inv.created_by_id] || 0) + 1;
    }
    console.log('LB counts:', JSON.stringify(counts));

    // Build leaderboard entries — only Explorer/Investigator/Trailblazer
    // (and admins) participate. All tiers can view the leaderboard.
    // Filter on the ORIGINAL user objects (which carry role/plan) BEFORE
    // mapping to the display shape — mapping first strips those fields so the
    // plan filter would see undefined and exclude everyone. Eligibility uses
    // the assigned plan (u.plan), not the time-active effective plan, so
    // completed-investigation history for Investigator/Explorer/Trailblazer
    // accounts stays on the leaderboard even if their subscription lapsed.
    // Only genuinely free (observer) users are excluded.
    const leaderboard = users
      .filter(u => (counts[u.id] || 0) > 0)
      .filter(u => {
        if (u.role === 'admin') return true;
        const plan = u.plan || 'observer';
        return plan === 'explorer' || plan === 'investigator' || plan === 'trailblazer';
      })
      .map(u => ({
        id: u.id,
        name: u.display_name || u.full_name || 'Anonymous',
        profile_image_url: u.profile_image_url || null,
        count: counts[u.id] || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return Response.json({ leaderboard, currentUserId: user.id });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});