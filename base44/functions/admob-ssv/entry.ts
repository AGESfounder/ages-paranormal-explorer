import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isPaidAccess } from '../../shared/access.js';

// AdMob rewarded Server-Side Verification (SSV) callback.
// Google sends an unauthenticated HTTPS GET with a signed query string.
// This endpoint verifies the signature, allow-lists production rewarded units,
// and writes a durable AdMobReward ledger row keyed by transaction_id.
// user_id is OPTIONAL per Google's SSV docs: a valid signed request without
// it (e.g. the AdMob console "Verify URL" test) still gets HTTP 200, but with
// no user lookup, no ledger row, and no energy grant.
//
// IMPORTANT: This phase preserves immediate client grant-ad-reward for UX.
// A verified SSV row is an audit/reconciliation record only — it does NOT
// grant a second +10 energy reward. It also does not by itself stop a paid
// user from invoking grant-ad-reward without watching an ad.

const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEY_CACHE_MAX_MS = 24 * 60 * 60 * 1000;

/** Production rewarded ad units (full IDs and numeric suffixes AdMob may send). */
const ALLOWED_REWARDED_AD_UNITS = new Set([
  'ca-app-pub-7999682122277742/9748657187', // Android
  'ca-app-pub-7999682122277742/6074658562', // iOS
  '9748657187',
  '6074658562',
]);

/** @type {{ fetchedAt: number, byKeyId: Map<number, string> } | null} */
let publicKeyCache = null;

function jsonResponse(body, status = 200) {
  return Response.json(body, { status });
}

/**
 * Extract query parameter NAMES only from a raw query string.
 * Never decodes, logs, or returns values. Safe on absent/malformed input.
 */
function getQueryParamNames(rawQuery) {
  if (typeof rawQuery !== 'string' || !rawQuery) return [];
  const names = [];
  for (const pair of rawQuery.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const name = eq === -1 ? pair : pair.slice(0, eq);
    if (name) names.push(name);
  }
  return names;
}

/**
 * Safe diagnostic logger. Emits ONLY an allow-listed structured object:
 * method, parameter_names, optional ad_unit, optional numeric key_id,
 * stage, and a sanitized constant reason code. Never logs signature
 * values, raw query strings, secrets/authorization headers, custom_data
 * values, full user IDs, transaction IDs, or raw exception messages.
 * Unknown extra fields passed by callers are dropped by construction.
 */
function logDiagnostic(level, { method, parameterNames, adUnit, keyId, stage, reason }) {
  const entry = {
    function: 'admob-ssv',
    method: typeof method === 'string' && method ? method : 'UNKNOWN',
    parameter_names: Array.isArray(parameterNames) ? parameterNames : [],
    stage: String(stage || 'unknown'),
    reason: String(reason || 'internal_error'),
  };
  if (typeof adUnit === 'string' && adUnit) entry.ad_unit = adUnit;
  const numericKeyId = Number(keyId);
  if (Number.isFinite(numericKeyId)) entry.key_id = numericKeyId;
  if (level === 'error') {
    console.error('admob-ssv diagnostic:', JSON.stringify(entry));
  } else {
    console.log('admob-ssv diagnostic:', JSON.stringify(entry));
  }
}

/**
 * Extract the raw query string without re-encoding or reordering.
 * Prefer the request URL as received so signature bytes stay intact.
 */
function getRawQuery(req) {
  const rawUrl = req?.url || '';
  const q = rawUrl.indexOf('?');
  if (q === -1) return '';
  // Strip any fragment if present
  const hash = rawUrl.indexOf('#', q);
  return hash === -1 ? rawUrl.slice(q + 1) : rawUrl.slice(q + 1, hash);
}

/**
 * Split content-to-verify from signature + key_id without sorting/decoding.
 * Google always places signature and key_id last, in that order.
 */
function splitSignedQuery(rawQuery) {
  const sigMarker = 'signature=';
  const keyMarker = 'key_id=';
  const sigIndex = rawQuery.indexOf(sigMarker);
  if (sigIndex <= 0) {
    throw new Error('missing signature query parameter');
  }
  // content ends just before the & that precedes signature=
  if (rawQuery[sigIndex - 1] !== '&') {
    throw new Error('signature parameter must be preceded by &');
  }
  const content = rawQuery.slice(0, sigIndex - 1);
  const sigAndKey = rawQuery.slice(sigIndex);
  const keyIndex = sigAndKey.indexOf(keyMarker);
  if (keyIndex <= 0) {
    throw new Error('missing key_id query parameter');
  }
  if (sigAndKey[keyIndex - 1] !== '&') {
    throw new Error('key_id parameter must be preceded by &');
  }
  const signature = sigAndKey.slice(sigMarker.length, keyIndex - 1);
  const keyIdRaw = sigAndKey.slice(keyIndex + keyMarker.length);
  if (!signature || !keyIdRaw) {
    throw new Error('empty signature or key_id');
  }
  const keyId = Number(keyIdRaw);
  if (!Number.isFinite(keyId)) {
    throw new Error('invalid key_id');
  }
  return { content, signature, keyId };
}

/** Parse query params for field validation only (not for signature bytes). */
function parseQueryFields(rawQuery) {
  const params = new URLSearchParams(rawQuery);
  return {
    ad_network: params.get('ad_network') || '',
    ad_unit: params.get('ad_unit') || '',
    custom_data: params.get('custom_data'),
    reward_amount: params.get('reward_amount') || '',
    reward_item: params.get('reward_item') || '',
    timestamp: params.get('timestamp') || '',
    transaction_id: params.get('transaction_id') || '',
    user_id: params.get('user_id') || '',
    signature: params.get('signature') || '',
    key_id: params.get('key_id') || '',
  };
}

function base64ToBytes(b64) {
  const normalized = String(b64).replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const bin = atob(normalized + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Convert DER-encoded ECDSA signature to IEEE P1363 raw r||s (Web Crypto).
 * P-256 → 32-byte components.
 */
function derEcdsaSignatureToRaw(der, componentSize = 32) {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error('invalid DER sequence');

  let seqLen = der[offset++];
  if (seqLen & 0x80) {
    const n = seqLen & 0x7f;
    seqLen = 0;
    for (let i = 0; i < n; i++) seqLen = (seqLen << 8) | der[offset++];
  }
  if (seqLen < 0) throw new Error('invalid DER length');

  if (der[offset++] !== 0x02) throw new Error('expected INTEGER r');
  const rLen = der[offset++];
  let r = der.subarray(offset, offset + rLen);
  offset += rLen;

  if (der[offset++] !== 0x02) throw new Error('expected INTEGER s');
  const sLen = der[offset++];
  let s = der.subarray(offset, offset + sLen);

  // Strip leading zero padding from ASN.1 integers
  while (r.length > 1 && r[0] === 0x00) r = r.subarray(1);
  while (s.length > 1 && s[0] === 0x00) s = s.subarray(1);
  if (r.length > componentSize || s.length > componentSize) {
    throw new Error('ECDSA component too large for P-256');
  }

  const raw = new Uint8Array(componentSize * 2);
  raw.set(r, componentSize - r.length);
  raw.set(s, componentSize * 2 - s.length);
  return raw;
}

async function getPublicKeysById() {
  const now = Date.now();
  if (publicKeyCache && now - publicKeyCache.fetchedAt < KEY_CACHE_MAX_MS) {
    return publicKeyCache.byKeyId;
  }

  const res = await fetch(ADMOB_KEYS_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`failed to fetch AdMob public keys: HTTP ${res.status}`);
  }
  const data = await res.json();
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  if (keys.length === 0) {
    throw new Error('AdMob public key set is empty');
  }

  /** @type {Map<number, string>} */
  const byKeyId = new Map();
  for (const key of keys) {
    const id = Number(key.keyId);
    const spki = key.base64 || null;
    if (!Number.isFinite(id) || !spki) continue;
    byKeyId.set(id, spki);
  }
  if (byKeyId.size === 0) {
    throw new Error('no usable AdMob public keys');
  }

  publicKeyCache = { fetchedAt: now, byKeyId };
  return byKeyId;
}

async function verifyAdMobSignature(content, signatureB64, keyId) {
  let keys = await getPublicKeysById();
  let keySpki = keys.get(keyId);
  if (!keySpki) {
    // Key might have rotated — bust cache once and retry
    publicKeyCache = null;
    keys = await getPublicKeysById();
    keySpki = keys.get(keyId);
  }
  if (!keySpki) throw new Error(`unknown AdMob key_id: ${keyId}`);

  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    base64ToBytes(keySpki),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );

  const data = new TextEncoder().encode(content);
  const derSig = base64ToBytes(decodeURIComponent(signatureB64));
  const rawSig = derEcdsaSignatureToRaw(derSig);

  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    rawSig,
    data
  );
  if (!ok) throw new Error('ECDSA signature verification failed');
}

function validateSignedFields(fields) {
  if (!fields.transaction_id) throw new Error('missing transaction_id');
  if (!fields.ad_unit) throw new Error('missing ad_unit');
  if (!ALLOWED_REWARDED_AD_UNITS.has(fields.ad_unit)) {
    throw new Error(`ad_unit not allow-listed: ${fields.ad_unit}`);
  }
  if (!fields.ad_network) throw new Error('missing ad_network');
  if (!fields.reward_amount) throw new Error('missing reward_amount');
  if (!fields.reward_item) throw new Error('missing reward_item');
  if (!fields.timestamp) throw new Error('missing timestamp');
  // user_id is OPTIONAL per Google SSV docs — its absence is handled in the
  // handler after signature verification; do not reject the request here.

  const amount = Number(fields.reward_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('invalid reward_amount');
  }
  const ts = Number(fields.timestamp);
  if (!Number.isFinite(ts) || ts <= 0) {
    throw new Error('invalid timestamp');
  }
}

/**
 * Decode custom_data only after signature verification.
 * Accepts plain user id or JSON { userId }.
 */
function parseCustomData(customData) {
  if (customData == null || customData === '') return null;
  const decoded = customData;
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') {
      return {
        raw: decoded,
        userId: parsed.userId ? String(parsed.userId) : null,
      };
    }
  } catch {
    // not JSON — treat as opaque string
  }
  return { raw: decoded, userId: null };
}

export default async function (req) {
  const method = req?.method || 'UNKNOWN';
  const rawQuery = getRawQuery(req);
  const parameterNames = getQueryParamNames(rawQuery);
  try {
    if (method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (!rawQuery) {
      logDiagnostic('error', {
        method,
        parameterNames,
        stage: 'receive',
        reason: 'missing_query',
      });
      return jsonResponse({ error: 'Missing query string' }, 400);
    }

    let content;
    let signature;
    let keyId;
    try {
      ({ content, signature, keyId } = splitSignedQuery(rawQuery));
    } catch {
      logDiagnostic('error', {
        method,
        parameterNames,
        stage: 'query_split',
        reason: 'query_split_failed',
      });
      return jsonResponse({ error: 'Invalid signed query' }, 400);
    }

    try {
      await verifyAdMobSignature(content, signature, keyId);
    } catch {
      logDiagnostic('error', {
        method,
        parameterNames,
        keyId,
        stage: 'signature_verification',
        reason: 'signature_verification_failed',
      });
      return jsonResponse({ error: 'Invalid signature' }, 400);
    }

    const fields = parseQueryFields(rawQuery);
    try {
      validateSignedFields(fields);
    } catch (e) {
      logDiagnostic('error', {
        method,
        parameterNames,
        adUnit: fields.ad_unit,
        keyId,
        stage: 'field_validation',
        reason: 'field_validation_failed',
      });
      return jsonResponse({ error: e.message }, 400);
    }

    const custom = parseCustomData(fields.custom_data);
    const userId = String(fields.user_id);

    // Google documents user_id as optional. A signature-verified request
    // without it (e.g. AdMob's "Verify URL" test) is authentic but cannot be
    // correlated to a Base44 user. Acknowledge with 200 so AdMob treats the
    // endpoint as healthy: no User.get, no AdMobReward row, no energy grant.
    // Signature and ad-unit allow-list checks above still gate this path.
    if (!userId) {
      logDiagnostic('info', {
        method,
        parameterNames,
        adUnit: fields.ad_unit,
        keyId,
        stage: 'user_resolution',
        reason: 'no_user_id_audit_only',
      });
      return jsonResponse(
        {
          success: true,
          verified: true,
          audit_only: true,
          user_linked: false,
          granted: false,
          transaction_id: fields.transaction_id,
          ad_unit: fields.ad_unit,
          custom_data_user_id_present: Boolean(custom?.userId),
          detail:
            'Valid Google-signed SSV request without user_id (optional per AdMob docs). No user lookup performed, no AdMobReward row written, no energy granted.',
        },
        200
      );
    }

    if (custom?.userId && custom.userId !== userId) {
      logDiagnostic('error', {
        method,
        parameterNames,
        adUnit: fields.ad_unit,
        keyId,
        stage: 'custom_data_validation',
        reason: 'custom_data_user_mismatch',
      });
      return jsonResponse({ error: 'user_id mismatch' }, 400);
    }

    // Google has no Base44 bearer token — service role only.
    const base44 = createClientFromRequest(req);

    // Idempotency: existing transaction_id → 200, no second grant/write.
    let existing = [];
    try {
      existing = await base44.asServiceRole.entities.AdMobReward.filter({
        transaction_id: fields.transaction_id,
      });
    } catch {
      logDiagnostic('error', {
        method,
        parameterNames,
        adUnit: fields.ad_unit,
        keyId,
        stage: 'ledger_lookup',
        reason: 'ledger_lookup_failed',
      });
      return jsonResponse({ error: 'Ledger lookup failed' }, 500);
    }

    if (existing && existing.length > 0) {
      logDiagnostic('info', {
        method,
        parameterNames,
        adUnit: fields.ad_unit,
        keyId,
        stage: 'idempotency_check',
        reason: 'duplicate',
      });
      return jsonResponse({
        success: true,
        duplicate: true,
        transaction_id: fields.transaction_id,
      }, 200);
    }

    // Resolve user; require a real Base44 user. Do not mutate plan/billing fields.
    let user = null;
    try {
      user = await base44.asServiceRole.entities.User.get(userId);
    } catch {
      logDiagnostic('error', {
        method,
        parameterNames,
        adUnit: fields.ad_unit,
        keyId,
        stage: 'user_lookup',
        reason: 'user_lookup_failed',
      });
      return jsonResponse({ error: 'Unknown user' }, 400);
    }
    if (!user) {
      return jsonResponse({ error: 'Unknown user' }, 400);
    }

    const paid = isPaidAccess(user);
    const processedAt = new Date().toISOString();
    const note = paid
      ? 'Verified SSV audit row only; energy granted via client grant-ad-reward path.'
      : 'Verified SSV for non-paid user; no energy grant from this endpoint.';

    try {
      await base44.asServiceRole.entities.AdMobReward.create({
        transaction_id: fields.transaction_id,
        user_id: userId,
        ad_unit: fields.ad_unit,
        ad_network: fields.ad_network,
        reward_amount: String(fields.reward_amount),
        reward_item: String(fields.reward_item),
        reward_timestamp: String(fields.timestamp),
        custom_data: custom?.raw || fields.custom_data || null,
        key_id: String(keyId),
        signature: fields.signature || signature,
        raw_query: rawQuery,
        status: 'verified',
        processed_at: processedAt,
        note,
      });
    } catch {
      // Concurrent duplicate create — re-check and treat as idempotent success.
      try {
        const again = await base44.asServiceRole.entities.AdMobReward.filter({
          transaction_id: fields.transaction_id,
        });
        if (again && again.length > 0) {
          logDiagnostic('info', {
            method,
            parameterNames,
            adUnit: fields.ad_unit,
            keyId,
            stage: 'ledger_write',
            reason: 'duplicate',
          });
          return jsonResponse({
            success: true,
            duplicate: true,
            transaction_id: fields.transaction_id,
          }, 200);
        }
      } catch {
        // fall through
      }
      logDiagnostic('error', {
        method,
        parameterNames,
        adUnit: fields.ad_unit,
        keyId,
        stage: 'ledger_write',
        reason: 'ledger_write_failed',
      });
      return jsonResponse({ error: 'Ledger write failed' }, 500);
    }

    logDiagnostic('info', {
      method,
      parameterNames,
      adUnit: fields.ad_unit,
      keyId,
      stage: 'complete',
      reason: 'verified',
    });

    // No second energy grant — audit/reconciliation only.
    return jsonResponse({
      success: true,
      duplicate: false,
      transaction_id: fields.transaction_id,
      granted: false,
      audit_only: true,
    }, 200);
  } catch {
    logDiagnostic('error', {
      method,
      parameterNames,
      stage: 'handler',
      reason: 'internal_error',
    });
    return jsonResponse({ error: 'Internal error' }, 500);
  }
}