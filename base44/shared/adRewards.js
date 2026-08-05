// Ad reward constants — shared by backend functions.
// Frontend has its own copy in src/lib/adRewards.js for display.

export const AD_REWARD_ENERGY = 10;
export const AD_REWARD_DAILY_LIMIT = 5;
export const AD_REWARD_NARRATION_PCT = 0.8;
export const AD_REWARD_MANIFESTATION_PCT = 0.2;

// Returns the narration/manifestation split for one ad reward.
export function getAdRewardSplit() {
  return {
    narration: Math.round(AD_REWARD_ENERGY * AD_REWARD_NARRATION_PCT),
    manifestation: Math.round(AD_REWARD_ENERGY * AD_REWARD_MANIFESTATION_PCT),
  };
}

// Returns today's date as YYYY-MM-DD (UTC) for daily cap tracking.
export function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}