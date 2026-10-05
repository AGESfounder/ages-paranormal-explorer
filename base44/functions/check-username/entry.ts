import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Public username availability check. Called from the Register page on blur
// to give the user early feedback before submitting. Returns only a boolean —
// never returns user data or a list of names.
//
// LIMITATION: Base44 does not support a unique index on display_name. This
// check narrows the race window but does not fully close it. The set-username
// function performs the authoritative check-and-write in a single service-role
// call. See set-username for details.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function(req) {
  try {
    const { username } = await req.json();
    if (!username || typeof username !== 'string') {
      return Response.json({ available: false, reason: 'invalid' });
    }
    const normalized = username.trim().toLowerCase();
    if (!normalized) {
      return Response.json({ available: false, reason: 'empty' });
    }

    const base44 = createClientFromRequest(req);

    // Check both username_lower (new users) and display_name (legacy users
    // who don't have username_lower set yet) case-insensitively.
    const existing = await base44.asServiceRole.entities.User.filter({
      $or: [
        { username_lower: normalized },
        { display_name: { $regex: '^' + escapeRegex(normalized) + '$', $options: 'i' } },
      ],
    });

    const available = !existing || existing.length === 0;
    return Response.json({ available, reason: available ? 'free' : 'taken' });
  } catch (error) {
    console.error('check-username error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}