// Stop ad-gate constants — shared by backend functions.
// Frontend has its own copy in src/lib/stopAdGate.js for display.

// Observer (free) users watch a rewarded ad to unlock paranormal content on
// stops 2+. This caps how many stops they can unlock per day via ads before
// being prompted to upgrade. Seeker+ and admins are ad-free (no cap).
export const STOP_AD_DAILY_CAP = 10;