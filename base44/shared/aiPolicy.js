// Fixed server prices, not client-reported costs or balances.
export function aiError(reason, status = 400) {
  return Object.assign(new Error(reason), { reason, status });
}
export function normalizeAiRequest(body) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(body?.request_id || '')) throw aiError('invalid_request_id');
  const kind = body.kind;
  const source = body.input || {};
  if (kind === 'narration') {
    if (typeof source.text !== 'string' || !source.text.trim() || source.text.length > 5000) throw aiError('invalid_narration_text');
    const voice = source.voice || 'storm';
    if (!['river', 'honey', 'sunny', 'storm', 'spark'].includes(voice)) throw aiError('invalid_voice');
    return { kind, cost: Math.ceil(source.text.length / 50), input: { text: source.text, voice } };
  }
  if (kind !== 'generation') throw aiError('invalid_kind');
  if (typeof source.prompt !== 'string' || !source.prompt.trim() || source.prompt.length > 150000) throw aiError('invalid_prompt');
  const model = source.model || 'automatic';
  if (!['automatic', 'gemini_3_flash', 'gemini_3_1_pro'].includes(model)) throw aiError('invalid_model');
  const input = { prompt: source.prompt, model, add_context_from_internet: source.add_context_from_internet === true };
  if (source.response_json_schema) {
    if (source.response_json_schema.type !== 'object' || JSON.stringify(source.response_json_schema).length > 30000) throw aiError('invalid_schema');
    input.response_json_schema = source.response_json_schema;
  }
  return { kind, cost: 1, input, expectJson: body.expect_json === true };
}
export function reservationUpdate(account, pools, lock) {
  const query = { id: account.id, ai_lock: null };
  const inc = {};
  for (const {field, amount} of pools) {
    query[field] = { $gte: amount };
    inc[field] = -amount;
  }
  return { query, update: { $set: { ai_lock: lock }, ...(pools.length ? { $inc: inc } : {}) } };
}
export function refundUpdate(accountId, lock) {
  const inc = {};
  for (const {field, amount} of lock.charge || []) inc[field] = amount;
  return { query: { id: accountId, 'ai_lock.token': lock.token }, update: { $set: {ai_lock: null}, ...(Object.keys(inc).length ? {$inc: inc} : {}) } };
}
export function parseAiJson(value) {
  if (value && typeof value === 'object') return value;
  let text = String(value || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{');
  let depth = 0, quoted = false, escape = false;
  for (let i = start; start >= 0 && i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { break; } }
  }
  throw aiError('invalid_ai_result', 502);
}