// Server-to-server Base44 client for third-party webhooks (RevenueCat, etc.).
//
// Why this exists: createClientFromRequest() validates BOTH the request's
// "Authorization" and "Base44-Service-Authorization" headers and throws
// 'Invalid authorization header format. Expected "Bearer <token>"' when either
// is not exactly "Bearer <token>". A webhook caller's Authorization header is
// the provider's shared secret (already verified by the webhook itself), not a
// Base44 user token, so that function is the wrong entry point for webhooks.
//
// This builder creates a SERVICE-ROLE-ONLY client with createClient():
//  - the service credential comes from the platform-injected
//    "Base44-Service-Authorization" header (the only service credential a
//    hosted function receives) and is parsed leniently;
//  - the caller's "Authorization" header is never read and no user token is
//    attached, so a provider secret can never be mistaken for a user token;
//  - app id, API url, functions version, state and data-env are propagated the
//    same way createClientFromRequest() propagates them.

function parseToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim().replace(/^Bearer\s+/i, '').trim();
  if (!token || /\s/.test(token)) return null;
  return token;
}

/**
 * @param {Request} req incoming webhook request (already authenticated by the caller)
 * @param {Function} createClient `createClient` from npm:@base44/sdk
 * @param {string} [fallbackAppId] app id used if the Base44-App-Id header is absent
 */
export function buildWebhookServiceClient(req, createClient, fallbackAppId = '') {
  const headers = req.headers;

  const appId = headers.get('Base44-App-Id') || fallbackAppId;
  if (!appId) {
    throw new Error('Webhook client: Base44 app id is unavailable');
  }

  const serviceToken = parseToken(headers.get('Base44-Service-Authorization'));
  if (!serviceToken) {
    throw new Error('Webhook client: platform service credential (Base44-Service-Authorization) is missing or unreadable');
  }

  const additionalHeaders = {};
  const state = headers.get('Base44-State');
  if (state) additionalHeaders['Base44-State'] = state;
  const dataEnv = headers.get('X-Data-Env');
  if (dataEnv === 'dev' || dataEnv === 'prod') additionalHeaders['X-Data-Env'] = dataEnv;

  return createClient({
    serverUrl: headers.get('Base44-Api-Url') || 'https://base44.app',
    appId,
    serviceToken,
    functionsVersion: headers.get('Base44-Functions-Version') ?? undefined,
    headers: additionalHeaders,
  });
}