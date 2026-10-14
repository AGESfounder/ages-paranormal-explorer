import { planSpend, readAccount, mirrorToRecord } from './energy.js';
import { aiError, reservationUpdate, refundUpdate, parseAiJson } from './aiPolicy.js';

const STALE_MS = 10 * 60 * 1000; // Beyond the platform's five-minute execution limit.
async function receipt(base44, userId, requestId) {
  const page = await base44.asServiceRole.entities.AiOperation.filter({user_id: userId, request_id: requestId}, {limit: 1});
  return page.items[0] || null;
}
async function release(base44, account, lock, refund) {
  const change = refund ? refundUpdate(account.id, lock) : {
    query: {id: account.id, 'ai_lock.token': lock.token}, update: {$set: {ai_lock: null}},
  };
  await base44.asServiceRole.entities.EnergyAccount.updateMany(change.query, change.update);
}
async function replay(base44, row, hash) {
  if (row.payload_hash !== hash) throw aiError('request_id_conflict', 409);
  if (row.status === 'failed') throw aiError(row.failure_reason || 'operation_failed_refunded', 422);
  if (row.status !== 'succeeded') throw aiError('operation_pending', 409);
  const {signed_url} = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({file_uri: row.result_uri, expires_in: 300});
  const response = await fetch(signed_url, {signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw aiError('result_temporarily_unavailable', 503);
  return {result: await response.json(), duplicate: true, cost: row.cost};
}

export async function executePaidAi(base44, user, entitlement, request, requestId, hash) {
  // Read-only here: never import a mutable User balance or trigger migration.
  const account = await readAccount(base44, user.id);
  if (!account) throw aiError('energy_reconciliation_required', 409);
  if (account.ai_lock && Date.now() - account.ai_lock.started_at > STALE_MS) {
    const old = await receipt(base44, user.id, account.ai_lock.request_id);
    if (old?.status !== 'succeeded') {
      // Mark terminal BEFORE releasing the mutex: this request can never execute again.
      if (old) await base44.asServiceRole.entities.AiOperation.update(old.id, {status: 'failed', failure_reason: 'operation_interrupted_refunded'});
      else await base44.asServiceRole.entities.AiOperation.create({user_id: user.id, request_id: account.ai_lock.request_id, payload_hash: account.ai_lock.payload_hash, kind: account.ai_lock.kind, status: 'failed', failure_reason: 'operation_interrupted_refunded'});
    }
    await release(base44, account, account.ai_lock, old?.status !== 'succeeded');
  }
  const prior = await receipt(base44, user.id, requestId);
  if (prior && prior.status !== 'pending') {
    if (prior.status === 'failed' && account.ai_lock?.request_id === requestId) await release(base44, account, account.ai_lock, true);
    return replay(base44, prior, hash);
  }
  if (prior) {
    if (prior.payload_hash !== hash) throw aiError('request_id_conflict', 409);
    throw aiError('operation_pending', 409);
  }
  const fresh = await readAccount(base44, user.id);
  if (fresh.ai_lock) throw aiError(fresh.ai_lock.request_id === requestId ? 'operation_pending' : 'account_busy', 409);
  const plan = entitlement.isAdmin ? {ok: true, pools: []} : planSpend(fresh, {
    kind: request.kind === 'generation' ? 'manifestation' : 'narration', cost: request.cost,
    genericAllowed: entitlement.genericAllowed, googleAllowed: entitlement.googleAllowed,
  });
  if (!plan.ok) throw aiError('insufficient', 402);
  const lock = {token: crypto.randomUUID(), request_id: requestId, payload_hash: hash, kind: request.kind, started_at: Date.now(), charge: plan.pools};
  const change = reservationUpdate(fresh, plan.pools, lock);
  // All pools + execution ownership in ONE conditional single-record update.
  await base44.asServiceRole.entities.EnergyAccount.updateMany(change.query, change.update);
  const claimed = await readAccount(base44, user.id);
  if (claimed?.ai_lock?.token !== lock.token) throw aiError('account_busy', 409);
  let row;
  let committed = false;
  try {
    // A prior worker may have committed between our first lookup and mutex acquisition.
    const again = await receipt(base44, user.id, requestId);
    if (again) {
      await release(base44, claimed, lock, true);
      return replay(base44, again, hash);
    }
    row = await base44.asServiceRole.entities.AiOperation.create({user_id: user.id, request_id: requestId, payload_hash: hash, kind: request.kind, status: 'pending', cost: entitlement.isAdmin ? 0 : request.cost, charge: plan.pools});
    const core = base44.asServiceRole.integrations.Core;
    let result = request.kind === 'generation' ? await core.InvokeLLM(request.input) : await core.GenerateSpeech(request.input);
    if (request.kind === 'narration') {
      if (typeof result?.url !== 'string' || !result.url.startsWith('https://')) throw aiError('invalid_ai_result', 502);
    } else if (request.expectJson || request.input.response_json_schema) {
      result = parseAiJson(result);
      if (!result || typeof result !== 'object' || Array.isArray(result) || !Object.keys(result).length) throw aiError('invalid_ai_result', 502);
    } else if (!result) throw aiError('invalid_ai_result', 502);
    const file = new File([JSON.stringify(result)], 'ai-result.json', {type: 'application/json'});
    const {file_uri} = await core.UploadPrivateFile({file});
    await base44.asServiceRole.entities.AiOperation.update(row.id, {status: 'succeeded', result_uri: file_uri});
    committed = true;
    await release(base44, claimed, lock, false);
    await mirrorToRecord(base44, user.id, await readAccount(base44, user.id));
    return {result, duplicate: false, cost: entitlement.isAdmin ? 0 : request.cost};
  } catch (error) {
    // Never refund a durable success just because the response/mirror failed.
    if (committed) throw aiError('result_temporarily_unavailable', 503);
    // A lost acknowledgement may still have committed the receipt.
    const durable = row ? await receipt(base44, user.id, requestId) : null;
    if (durable?.status === 'succeeded') throw aiError('result_temporarily_unavailable', 503);
    if (row) await base44.asServiceRole.entities.AiOperation.update(row.id, {status: 'failed', failure_reason: 'operation_failed_refunded'});
    else await base44.asServiceRole.entities.AiOperation.create({user_id:user.id, request_id:requestId, payload_hash:hash, kind:request.kind, status:'failed', failure_reason:'operation_failed_refunded'});
    await release(base44, claimed, lock, true);
    await mirrorToRecord(base44, user.id, await readAccount(base44, user.id));
    console.error('Paid AI operation failed; reservation reversed:', error?.message);
    throw aiError('operation_failed_refunded', 502);
  }
}