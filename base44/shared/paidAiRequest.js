import { resolveTrustedEntitlement, canGenerateForPlan } from './entitlement.js';
import { normalizeAiRequest, aiError } from './aiPolicy.js';
import { executePaidAi } from './aiOperations.js';

export async function aiPayloadHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function runProtectedAi(base44, user, body) {
  if (!user?.id) throw aiError('unauthorized', 401);
  const request = normalizeAiRequest(body);
  const entitlement = await resolveTrustedEntitlement(base44, user);
  if (entitlement.ledgerUnavailable) throw aiError('entitlement_unavailable', 503);
  if (!entitlement.isPaid || (request.kind === 'generation' && !canGenerateForPlan(entitlement.planId, entitlement.isAdmin))) throw aiError('plan', 403);
  return executePaidAi(base44, user, entitlement, request, body.request_id, await aiPayloadHash(request));
}
// Coordinate repair has a fixed server-built prompt, never a caller-built prompt.
// Stable content-derived IDs prevent repeat tour opens from recharging the same lookup.
export async function paidCoordinateSearch(base44, user, input) {
  const baseId = `coords_${await aiPayloadHash(input)}`;
  const request = normalizeAiRequest({kind: 'generation', input, request_id: baseId, expect_json: true});
  const page = await base44.asServiceRole.entities.AiOperation.filter({user_id: user.id, payload_hash: await aiPayloadHash(request)}, {sort: '-created_date', limit: 1});
  const prior = page.items[0];
  // Reuse durable/pending work; a terminal refunded failure permits a genuinely
  // new attempt rather than making a transient provider failure permanent.
  const request_id = prior?.status === 'failed' ? `coords_${crypto.randomUUID()}` : prior?.request_id || baseId;
  const outcome = await runProtectedAi(base44, user, {kind: 'generation', input, request_id, expect_json: true});
  return outcome.result;
}