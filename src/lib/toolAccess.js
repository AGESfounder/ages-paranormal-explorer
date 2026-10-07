// Toolkit tool access configuration — shared across Toolkit.jsx, TierToolsComparison,
// and the tool ad-gate hook. Mirrors the approved Phase 3 spec:
//   2 ad-gated tools (Observer only): Audio Recorder, Radio Sweeper
//   30s ad = 30s use, 5-min (300s) daily cap per tool
//   Server-authoritative: consume-tool-time uses server wall clock;
//   client never writes tool_banks.r directly.

import { getEffectivePlanId } from '@/lib/access';

// Tools that are ad-gated for Observer (free) users. 30s ad = 30s use, 5min/day cap.
// Seeker+ tiers get these ad-free (no ad gate).
export const AD_GATED_TOOLS = [
  'Audio Recorder',
  'Radio Sweeper',
];

// 30 seconds of tool use per ad watch
export const TOOL_AD_DURATION = 30;
// 5 minutes (300 seconds) daily cap per tool
export const TOOL_DAILY_CAP = 300;

// Tier → tool access. null = all 12 tools.
// Observer: 4 tools (2 free + 2 ad-gated)
// Seeker: 4 tools (ad-free, same as Observer)
// Technician: 10 tools (adds 6 investigation tools)
// Explorer: 10 tools (same as Technician — adds energy, not tools)
// Investigator+: all 12 tools (adds Terms Sweeper + Anomaly Camera)
export const TIER_TOOLS = {
  observer: [
    'Audio Recorder', 'Radio Sweeper',
    'Equipment Guide', 'Safety Protocol',
  ],
  seeker: [
    'Audio Recorder', 'Radio Sweeper',
    'Equipment Guide', 'Safety Protocol',
  ],
  technician: [
    'Audio Recorder', 'Radio Sweeper',
    'Yes/No/IDK Sweeper', 'Vibration Communicator', 'Alphabet Sweeper',
    'Weather Monitor', 'Moon Phase', 'Paranormal Research: Terms',
    'Equipment Guide', 'Safety Protocol',
  ],
  explorer: [
    'Audio Recorder', 'Radio Sweeper',
    'Yes/No/IDK Sweeper', 'Vibration Communicator', 'Alphabet Sweeper',
    'Weather Monitor', 'Moon Phase', 'Paranormal Research: Terms',
    'Equipment Guide', 'Safety Protocol',
  ],
  investigator: null, // null = all 12 tools
  trailblazer: null,
};

export function isAdGated(toolName) {
  return AD_GATED_TOOLS.includes(toolName);
}

export function getToolsForTier(planId) {
  return TIER_TOOLS[planId];
}

export function canAccessTool(planId, toolName, isAdmin = false) {
  if (isAdmin) return true;
  const allowed = TIER_TOOLS[planId];
  if (allowed === null) return true; // null = all tools
  if (!allowed) return false; // unknown tier
  return allowed.includes(toolName);
}

// Check if an Observer user needs to watch an ad for this tool.
// Returns true only if the tool is ad-gated AND the user's EFFECTIVE plan is
// Observer. Uses getEffectivePlanId so Google Trailblazer (whose access lives
// in google_trailblazer_expiration_date, not user.plan) is NOT gated.
// Seeker+ and admins never need ads.
export function needsToolAdGate(user, toolName) {
  if (!user) return false;
  if (user.role === 'admin') return false;
  const planId = getEffectivePlanId(user);
  if (planId !== 'observer') return false;
  return isAdGated(toolName);
}

// Parse tool_banks from the user record.
// Returns { toolName: { r: number, e: number, l: number } } or {}.
// r = remaining seconds, e = earned today (daily cap), l = last heartbeat ms (consume-tool-time)
export function parseToolBanks(user) {
  if (!user?.tool_banks) return {};
  try {
    const parsed = typeof user.tool_banks === 'string'
      ? JSON.parse(user.tool_banks)
      : user.tool_banks;
    return parsed || {};
  } catch {
    return {};
  }
}

// Get remaining seconds for a tool from tool_banks.
export function getToolRemaining(user, toolName) {
  const banks = parseToolBanks(user);
  return banks[toolName]?.r || 0;
}

// Get earned-today seconds for a tool from tool_banks.
export function getToolEarned(user, toolName) {
  const banks = parseToolBanks(user);
  return banks[toolName]?.e || 0;
}