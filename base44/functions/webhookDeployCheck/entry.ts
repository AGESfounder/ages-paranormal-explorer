// TEMPORARY deploy diagnostic — deleted after use. Re-exports the full
// revenuecat-webhook handler so its current source can be compiled/deployed
// under a throwaway name (no RevenueCat configuration involved).
import handler from '../revenuecat-webhook/entry.ts';

export default handler;