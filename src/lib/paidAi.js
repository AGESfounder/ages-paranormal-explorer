import { base44 } from '@/api/base44Client';

const running = new Map();
async function invoke(user, kind, input, expectJson) {
  const bytes = new TextEncoder().encode(JSON.stringify({kind, input, expect_json: expectJson}));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
  const key = `ages_ai_pending_${user.id}_${hash}`;
  let requestId;
  try { requestId = sessionStorage.getItem(key); } catch {}
  requestId ||= crypto.randomUUID();
  try { sessionStorage.setItem(key, requestId); } catch {}
  const payload = {kind, input, expect_json: expectJson, request_id: requestId};
  for (let attempt = 0; attempt < 75; attempt++) {
    try {
      const response = await base44.functions.invoke('paid-ai', payload);
      try { sessionStorage.removeItem(key); } catch {}
      window.dispatchEvent(new Event('energy-updated'));
      return response.data.result;
    } catch (error) {
      const reason = error?.response?.data?.reason;
      const status = error?.response?.status;
      if (['account_busy', 'operation_pending', 'result_temporarily_unavailable'].includes(reason) || !status || (status >= 500 && !reason?.includes('_refunded'))) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue; // Same request id; never create a second paid operation.
      }
      try { sessionStorage.removeItem(key); } catch {}
      window.dispatchEvent(new CustomEvent('paid-ai-error', {detail: {reason}}));
      window.dispatchEvent(new Event('energy-updated'));
      const message = reason === 'insufficient' ? 'You do not have enough energy for this operation.' : reason === 'energy_reconciliation_required' ? 'Your energy balance needs a safe account review before AI can run. Your saved balances have not been changed.' : reason?.includes('refunded') ? 'The operation failed. Any reserved energy has been returned.' : 'Could not authorize this AI operation. Please try again.';
      throw Object.assign(new Error(message), {reason, status});
    }
  }
  throw new Error('This operation is still pending. Retry to retrieve the same result without another charge.');
}
async function singleFlight(kind, input, expectJson = false) {
  const user = await base44.auth.me();
  const key = JSON.stringify({userId: user.id, kind, input, expectJson});
  if (!running.has(key)) running.set(key, invoke(user, kind, input, expectJson).finally(() => running.delete(key)));
  return running.get(key);
}
export const paidGenerate = (input, options = {}) => singleFlight('generation', input, options.expectJson === true);
export const paidSpeech = (input) => singleFlight('narration', input);