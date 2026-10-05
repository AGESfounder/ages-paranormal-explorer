// Toolkit tool access configuration — shared across Toolkit.jsx, TierToolsComparison,
// and the tool ad-gate hook. Mirrors the Phase 3 spec:
//   4 ad-gated tools (Observer only): Alphabet, Yes/No, Vibration, Camera
//   3 paid-only tools (no ad option): Audio Recorder, Radio Sweeper, Term Sweeper
//   30s ad = 30s use, 5-min (300s) daily cap per tool
//   Server-side tool_banks counter prevents localStorage spoofing

// Tools that are ad-gated for Observer (free) users. 30s ad = 30s use, 5min/day cap.
// Seeker+ tiers get these ad-free (no ad gate).
export const AD_GATED_TOOLS = [
  'Alphabet Sweeper',
  'Yes/No/IDK Sweeper',
  'Vibration Communicator',
  'Anomaly Camera',
];

// Generative tools that are paid-only — no ad-watching option.
// Audio Recorder + Radio Sweeper unlock at Technician; Term Sweeper at Investigator.
export const PAID_ONLY_TOOLS = [
  'Audio Recorder',
  'Radio Sweeper',
  'Term Sweeper',
];

// 30 seconds of tool use per ad watch
export const TOOL_AD_DURATION = 30;
// 5 minutes (300 seconds) daily cap per tool
export const TOOL_DAILY_CAP = 300;

// Tier → tool access. null = all 12 tools. Mirrors TierToolsComparison.jsx.
// Observer: 6 tools (2 free + 4 ad-gated) — "6 tools for Observer"
// Seeker: 6 tools (ad-free, same as Observer)
// Technician: 10 tools (adds Audio Recorder, Radio Sweeper, Weather Monitor, Moon Phase)
// Explorer: 11 tools (adds Paranormal Research: Terms)
// Investigator+: all 12 tools (adds Term Sweeper)
export const TIER_TOOLS = {
  observer: [
    'Equipment Guide', 'Safety Protocol',
    'Alphabet Sweeper', 'Yes/No/IDK Sweeper', 'Vibration Communicator', 'Anomaly Camera',
  ],
  seeker: [
    'Equipment Guide', 'Safety Protocol',
    'Alphabet Sweeper', 'Yes/No/IDK Sweeper', 'Vibration Communicator', 'Anomaly Camera',
  ],
  technician: [
    'Equipment Guide', 'Safety Protocol',
    'Alphabet Sweeper', 'Yes/No/IDK Sweeper', 'Vibration Communicator', 'Anomaly Camera',
    'Audio Recorder', 'Radio Sweeper', 'Weather Monitor', 'Moon Phase',
  ],
  explorer: [
    'Equipment Guide', 'Safety Protocol',
    'Alphabet Sweeper', 'Yes/No/IDK Sweeper', 'Vibration Communicator', 'Anomaly Camera',
    'Audio Recorder', 'Radio Sweeper', 'Weather Monitor', 'Moon Phase',
    'Paranormal Research: Terms',
  ],
  investigator: null, // null = all 12 tools
  trailblazer: null,
};

export function isAdGated(toolName) {
  return AD_GATED_TOOLS.includes(toolName);
}

export function isPaidOnly(toolName) {
  return PAID_ONLY_TOOLS.includes(toolName);
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
// Returns true only if the tool is ad-gated AND the user is on the Observer plan.
// Seeker+ and admins never need ads.
export function needsToolAdGate(user, toolName) {
  if (!user) return false;
  if (user.role === 'admin') return false;
  const planId = user.plan || 'observer';
  if (planId !== 'observer') return false;
  return isAdGated(toolName);
}

// Parse tool_banks from the user record.
// Returns { toolName: { r: number, e: number } } or {}.
// r = remaining seconds, e = earned today (for daily cap enforcement)
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