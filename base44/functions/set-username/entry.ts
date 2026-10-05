import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Authoritative check-and-write for a user's display_name. Called after OTP
// verification (registration) and from the Profile page (name change).
//
// Performs the uniqueness check and the User.update in the same service-role
// call so the window between check and write is only the server round-trip —
// there is no client in between. Both display_name and username_lower are
// written atomically.
//
// LIMITATION: Base44 does not support a unique index on display_name, so two
// users submitting the identical username within the same few milliseconds
// could theoretically both pass the filter before either write lands. For
// human-typed names at registration this is effectively impossible in
// practice, but it is not a hard guarantee. A platform-level unique index
// would be required to close it fully.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { username } = await req.json();
    if (!username || typeof username !== 'string') {
      return Response.json({ error: 'Username required' }, { status: 400 });
    }
    const normalized = username.trim();
    const lower = normalized.toLowerCase();
    if (!lower) {
      return Response.json({ error: 'Username cannot be empty' }, { status: 400 });
    }

    // Check uniqueness, excluding the current user (so they can keep their
    // own name when re-saving on the Profile page).
    const existing = await base44.asServiceRole.entities.User.filter({
      $or: [
        { username_lower: lower },
        { display_name: { $regex: '^' + escapeRegex(lower) + '$', $options: 'i' } },
      ],
    });
    const others = (existing || []).filter((u) => u.id !== user.id);
    if (others.length > 0) {
      return Response.json(
        { error: 'That username is already taken', available: false },
        { status: 409 },
      );
    }

    // Write both fields in the same call.
    await base44.asServiceRole.entities.User.update(user.id, {
      display_name: normalized,
      username_lower: lower,
    });

    return Response.json({ success: true, display_name: normalized });
  } catch (error) {
    console.error('set-username error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}