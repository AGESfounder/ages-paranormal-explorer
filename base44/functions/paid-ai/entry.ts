import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { aiError } from '../../shared/aiPolicy.js';
import { runProtectedAi } from '../../shared/paidAiRequest.js';

export default async function(req) {
  try {
    if (req.method !== 'POST') throw aiError('method_not_allowed', 405);
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) throw aiError('unauthorized', 401);
    const body = await req.json();
    const outcome = await runProtectedAi(base44, user, body);
    return Response.json({ok: true, ...outcome});
  } catch (error) {
    console.error('paid-ai:', error.reason || 'server_error');
    return Response.json({ok: false, reason: error.reason || 'server_error'}, {status: error.status || 500});
  }
}