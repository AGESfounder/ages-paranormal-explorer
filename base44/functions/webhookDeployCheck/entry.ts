// TEMPORARY deploy diagnostic — deleted after use. Imports the same modules as
// revenuecat-webhook to confirm the shared import graph compiles and deploys.
import { createClient } from 'npm:@base44/sdk@0.8.40';
import { PLANS, getGrantForProduct, getNextResetDate } from '../../shared/plans.js';
import {
  APPLE_TRAILBLAZER_PRODUCT_ID,
  GOOGLE_TRAILBLAZER_PRODUCT_ID,
  computeGoogleTrailblazerExpiration,
  shouldProcessAppleTrailblazerEvent,
} from '../../shared/revenuecat.js';
import { buildWebhookServiceClient } from '../../shared/webhookClient.js';

export default async function (req: Request) {
  const sampleEvent = {
    type: 'NON_RENEWING_PURCHASE',
    store: 'APP_STORE',
    product_id: APPLE_TRAILBLAZER_PRODUCT_ID,
  };
  return Response.json({
    marker: 'deploy-check-1',
    trailblazerPlanPresent: Boolean((PLANS as any).trailblazer),
    grantFn: typeof getGrantForProduct,
    resetFn: typeof getNextResetDate,
    googleProduct: GOOGLE_TRAILBLAZER_PRODUCT_ID,
    appleTrailblazerRouted: shouldProcessAppleTrailblazerEvent(sampleEvent),
    expiryFn: typeof computeGoogleTrailblazerExpiration,
    clientBuilder: typeof buildWebhookServiceClient,
    createClientFn: typeof createClient,
    method: req.method,
  });
}