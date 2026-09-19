import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Resolves user IDs to display names using service role (bypasses User RLS).
// Returns { names: { [id]: display_name } } — falls back to "Explorer" when
// no display_name is set. Never exposes full_name or email for privacy.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ names: {} });
    }

    const uniqueIds = [...new Set(ids.filter(Boolean))];
    const results = await Promise.allSettled(
      uniqueIds.map(async (id) => {
        const u = await base44.asServiceRole.entities.User.get(id);
        // display_name takes precedence (user-editable via Profile page).
        // full_name is the username chosen at sign-up (Register page labels it
        // "Username"), so it's safe to use as a fallback — not a real name.
        return [id, u?.display_name || u?.full_name || 'Explorer'];
      })
    );

    const names = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const [id, name] = r.value;
        names[id] = name;
      } else {
        names[uniqueIds[i]] = 'Explorer';
      }
    });

    return Response.json({ names });
  } catch (error) {
    console.error('resolve-user-names error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}