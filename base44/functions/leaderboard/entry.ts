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

    // Count completed investigations per user
    const counts = {};
    for (const inv of investigations) {
      if (!inv.created_by_id) continue;
      counts[inv.created_by_id] = (counts[inv.created_by_id] || 0) + 1;
    }

    // Build leaderboard entries
    const leaderboard = users
      .map(u => ({
        id: u.id,
        name: u.full_name || 'Anonymous',
        profile_image_url: u.profile_image_url || null,
        count: counts[u.id] || 0,
      }))
      .filter(u => u.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return Response.json({ leaderboard, currentUserId: user.id });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});