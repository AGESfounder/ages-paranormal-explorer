import { base44 } from '@/api/base44Client';

// User-block helpers. Blocked users are persisted on the current user's
// `blocked_users` field as a JSON-encoded array of { id, name } objects, so UGC
// lists can filter out content authored by blocked users and the Settings
// screen can display blocked users by name. Purely additive — never modifies
// the blocked user's records.

function parseBlocked(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

export async function getBlockedIds() {
  try {
    const me = await base44.auth.me();
    const blocked = parseBlocked(me?.blocked_users);
    return blocked.map((b) => (typeof b === 'string' ? b : b?.id)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function getBlockedUsers() {
  try {
    const me = await base44.auth.me();
    return parseBlocked(me?.blocked_users).map((b) =>
      typeof b === 'string' ? { id: b, name: 'Blocked user' } : b
    ).filter((b) => b?.id);
  } catch {
    return [];
  }
}

export async function blockUser(userId, name) {
  if (!userId) return [];
  const me = await base44.auth.me();
  const blocked = parseBlocked(me?.blocked_users);
  if (!blocked.some((b) => (typeof b === 'string' ? b === userId : b?.id === userId))) {
    blocked.push({ id: userId, name: name || 'Blocked user' });
  }
  await base44.auth.updateMe({ blocked_users: JSON.stringify(blocked) });
  return blocked;
}

export async function unblockUser(userId) {
  const me = await base44.auth.me();
  const blocked = parseBlocked(me?.blocked_users).filter((b) =>
    (typeof b === 'string' ? b !== userId : b?.id !== userId)
  );
  await base44.auth.updateMe({ blocked_users: JSON.stringify(blocked) });
  return blocked;
}