import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// record-ios-purchase-diagnostic
// ---------------------------------------------------------------------------
// Append-only, redacted ingestion for native iOS recurring-subscription
// purchase diagnostics (AGES_IOS_PURCHASE_DIAG). Companion client seam:
// src/lib/iosPurchaseDiagnostics.js.
//
// Security / privacy contract:
//  - Caller MUST be an authenticated Base44 user (anonymous → 401). Records
//    are associated with the AUTHENTICATED caller only; the canonical
//    user_id_hash is computed server-side from auth.me() and a client-
//    supplied subject hint is verified, never trusted.
//  - The stored payload is built exclusively from a fixed key allowlist.
//    Unknown client keys are dropped; keys that name sensitive shapes
//    (email, password, token, api key, receipt, credentials, or RAW id
//    fields like user_id / customer_id / transaction_id) reject the event.
//  - Error strings are scrubbed (email / bearer / JWT-like / long token runs
//    removed) and length-capped BEFORE they are stored or logged.
//  - This function NEVER logs the user object, the request payload, raw
//    identifiers, or unstripped details — only constant metadata.
//  - Writes go through the service role into IosPurchaseDiagnostic ONLY.
//    This function must never touch User, RevenueCatPurchase,
//    Base44Purchase, or any entitlement/grant field.
//  - Reads are NOT served here: the Admin Users tab queries the entity
//    directly, where RLS restricts reads to role: admin.
// ---------------------------------------------------------------------------

const SOURCE = 'AGES_IOS_PURCHASE_DIAG';
const PLATFORM = 'ios';

const MAX_BODY_BYTES = 16384;
const MAX_ERROR_MESSAGE = 240;
const MAX_SHORT_STRING = 160;
const MAX_ARRAY_ITEMS = 12;
const MAX_ARRAY_ITEM_LENGTH = 80;
const MAX_DETAILS_JSON = 1940;

/** Fixed event vocabulary emitted by the iOS subscription purchase path. */
const ALLOWED_EVENT_NAMES = new Set([
  'subscription.begin',
  'identity.result',
  'identity.customer',
  'identity.customer.anonymous_status',
  'products.result',
  'purchase.start',
  'purchase.result',
  'customer.post_purchase',
  'customer.post_purchase.anonymous_status',
  'dashboard.purchase_start',
  'dashboard.purchase_result',
  'grant.poll_start',
  'grant.poll_result',
]);

const ALLOWED_LEVELS = new Set(['info', 'warn', 'error']);

/** Opaque client-generated ids (s_... / e_... style). */
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{4,48}$/;

/** Redaction token shape produced by hashIosDiagId (client + server). */
const HASH_TOKEN_PATTERN = /^id_[0-9a-f]{8}$/;

/**
 * Keys naming sensitive shapes. Any incoming details key matching one of
 * these rejects the whole event — sensitive data must never be stored,
 * even "accidentally". Allowlisted *Hash tokens do not match by design.
 */
const FORBIDDEN_KEY_PATTERNS = [
  /email/i,
  /e-?mail/i,
  /pass(word|code|phrase)?/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /apikey/i,
  /receipt/i,
  /authoriz/i,
  /credential/i,
  /bearer/i,
  /jwt/i,
  /refresh/i,
  /^(user[-_]?id|customer[-_]?id|customerid|transaction[-_]?id|app[-_]?user[-_]?id|original[-_]?app[-_]?user[-_]?id|original[-_]?transaction[-_]?id|rc[-_]?customer[-_]?id|store[-_]?transaction[-_]?id)$/i,
];

/** String detail keys that are public configuration/store identifiers. */
const STRING_KEYS = new Set([
  'path',
  'dashboardProductId',
  'planId',
  'appleProductId',
  'expectedPlanId',
  'via',
  'stage',
  'reason',
  'outcome',
  'observedPlan',
  'observedPlanExpirationDate',
  'observedSubscriptionStatus',
  'returnedProductIdentifier',
]);

/** Detail keys that must carry a redaction token shaped id_XXXXXXXX. */
const HASH_KEYS = new Set(['userIdHash', 'rcCustomerIdHash', 'transactionIdHash']);

const BOOLEAN_KEYS = new Set([
  'ok',
  'alreadyIdentified',
  'identified',
  'exactMatch',
  'customerInfoAvailable',
  'hasActiveEntitlement',
  'anonymous',
  'planMatches',
]);

const NUMBER_KEYS = new Set(['returnedCount', 'timeoutMs', 'intervalMs']);

const STRING_ARRAY_KEYS = new Set(['returnedProductIds', 'activeEntitlementIds']);

/**
 * Deterministic redaction hash (FNV-1a 32-bit), the SAME algorithm as the
 * client seam so console lines, store rows, and admin queries correlate.
 * Redaction/correlation token only — NOT a cryptographic boundary. The
 * canonical subject token is always computed here from auth.me(), never
 * taken from the client.
 */
function hashIosDiagId(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `id_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function jsonResponse(body, status = 200) {
  return Response.json(body, { status });
}

/**
 * Sanitized server-side diagnostic log. Emits ONLY constant metadata —
 * never the user, payload, details, or raw identifiers.
 */
function logSafe(level, entry) {
  const line = `record-ios-purchase-diagnostic: ${JSON.stringify({
    event: typeof entry?.event === 'string' ? entry.event.slice(0, 64) : 'unknown',
    level: typeof entry?.level === 'string' ? entry.level : 'unknown',
    result: String(entry?.result || 'unknown'),
    reason: String(entry?.reason || 'none'),
  })}`;
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

/** True when an incoming details key names a sensitive/raw-identifier shape. */
function isForbiddenKey(key) {
  const lowered = String(key).toLowerCase();
  return FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(lowered));
}

/** Cap a public configuration string (product/plan ids, reasons, etc.). */
function boundedString(value, maxLength = MAX_SHORT_STRING) {
  return String(value).slice(0, maxLength);
}

/** Strip non-printable / non-ASCII bytes down to single spaces. */
function stripControlChars(text) {
  let out = '';
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const printable = code >= 0x20 && code <= 0x7e;
    if (printable) {
      out += text.charAt(i);
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      out += ' ';
      lastWasSpace = true;
    }
  }
  return out;
}

/**
 * Scrub free-form error text: remove email addresses, bearer/JWT-like
 * tokens, long token-ish runs, and control characters, then cap length.
 * Deliberately aggressive — error text is the only free-form string we keep.
 */
function scrubErrorText(value) {
  let text = String(value);
  text = text.replace(/[\S]+@[\S]+\.[\S]+/g, '[redacted-email]');
  text = text.replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, '[redacted-token]');
  text = text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_.~-]+\.[A-Za-z0-9_.~-]*/g, '[redacted-jwt]');
  text = text.replace(/[A-Za-z0-9_+/-]{48,}={0,2}/g, '[redacted]');
  text = text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[redacted-uuid]');
  text = stripControlChars(text);
  return text.trim().slice(0, MAX_ERROR_MESSAGE);
}

/**
 * Build the bounded, allow-listed details object from the incoming client
 * details. Unknown keys are dropped; forbidden keys throw (event rejected).
 */
function buildSanitizedDetails(details) {
  const out = {};
  for (const [key, value] of Object.entries(details)) {
    if (isForbiddenKey(key)) {
      throw new Error(`forbidden field: ${key}`);
    }
    if (value === null || value === undefined) continue;

    if (STRING_KEYS.has(key)) {
      if (typeof value === 'string' || typeof value === 'number') {
        out[key] = boundedString(value);
      }
      continue;
    }
    if (HASH_KEYS.has(key)) {
      // Only a valid redaction token survives; anything else (including a
      // raw id mistakenly passed under a Hash key) is dropped.
      if (typeof value === 'string' && HASH_TOKEN_PATTERN.test(value)) {
        out[key] = value;
      }
      continue;
    }
    if (BOOLEAN_KEYS.has(key)) {
      if (typeof value === 'boolean') out[key] = value;
      continue;
    }
    if (NUMBER_KEYS.has(key)) {
      if (Number.isFinite(Number(value))) {
        out[key] = Math.trunc(Number(value));
      }
      continue;
    }
    if (STRING_ARRAY_KEYS.has(key)) {
      if (Array.isArray(value)) {
        out[key] = value
          .filter((item) => typeof item === 'string' && item.length > 0)
          .slice(0, MAX_ARRAY_ITEMS)
          .map((item) => boundedString(item, MAX_ARRAY_ITEM_LENGTH));
      }
      continue;
    }
    if (key === 'errorCode') {
      if (typeof value === 'string' || typeof value === 'number') {
        out[key] = boundedString(value, 48);
      }
      continue;
    }
    if (key === 'errorMessage') {
      if (typeof value === 'string') out[key] = scrubErrorText(value);
      continue;
    }
    // Unknown key — silently dropped (forward tolerance; server is authority).
  }
  return out;
}

/** Serialize details under the storage cap, shrinking largest fields first. */
function serializeDetails(details) {
  const clone = { ...details };
  let json = JSON.stringify(clone);
  if (json.length > MAX_DETAILS_JSON && Array.isArray(clone.returnedProductIds)) {
    clone.returnedProductIds = clone.returnedProductIds.slice(0, 4);
    json = JSON.stringify(clone);
  }
  if (json.length > MAX_DETAILS_JSON && Array.isArray(clone.activeEntitlementIds)) {
    clone.activeEntitlementIds = clone.activeEntitlementIds.slice(0, 8);
    json = JSON.stringify(clone);
  }
  if (json.length > MAX_DETAILS_JSON && typeof clone.errorMessage === 'string') {
    clone.errorMessage = `${clone.errorMessage.slice(0, 120)}…`;
    json = JSON.stringify(clone);
  }
  if (json.length > MAX_DETAILS_JSON) {
    // Last resort: keep only the outcome-critical scalar fields.
    const minimal = {};
    for (const key of ['ok', 'outcome', 'reason', 'stage', 'errorCode']) {
      if (clone[key] !== undefined) minimal[key] = clone[key];
    }
    json = JSON.stringify(minimal);
  }
  return json;
}

export default async function (req) {
  try {
    if (req?.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      logSafe('warn', { result: 'rejected', reason: 'unauthenticated' });
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Canonical subject: computed from the authenticated caller ONLY.
    const userIdHash = hashIosDiagId(user.id);

    let body;
    try {
      const raw = await req.text();
      if (!raw || raw.length > MAX_BODY_BYTES) {
        throw new Error('invalid length');
      }
      body = JSON.parse(raw);
    } catch {
      logSafe('warn', { result: 'rejected', reason: 'invalid_body' });
      return jsonResponse({ error: 'Invalid event body' }, 400);
    }

    const event = body?.event || {};
    const {
      source,
      platform,
      session_id: sessionId,
      event_id: eventId,
      event_name: eventName,
      level,
      outcome,
      occurred_at: occurredAt,
      details,
    } = event;
    const expectedUserHash = body?.expected_user_hash;

    // Subject verification: if the client asserts a subject token, it MUST
    // match the authenticated caller. This blocks cross-account upload of a
    // stale outbox after a sign-out/sign-in on a shared device.
    if (expectedUserHash != null && expectedUserHash !== userIdHash) {
      logSafe('warn', { event: eventName, result: 'rejected', reason: 'subject_mismatch' });
      return jsonResponse({ error: 'Subject mismatch' }, 403);
    }

    if (
      source !== SOURCE
      || platform !== PLATFORM
      || typeof sessionId !== 'string'
      || !OPAQUE_ID_PATTERN.test(sessionId)
      || typeof eventId !== 'string'
      || !OPAQUE_ID_PATTERN.test(eventId)
      || typeof eventName !== 'string'
      || !ALLOWED_EVENT_NAMES.has(eventName)
      || typeof level !== 'string'
      || !ALLOWED_LEVELS.has(level)
    ) {
      logSafe('warn', { event: eventName, level, result: 'rejected', reason: 'invalid_event' });
      return jsonResponse({ error: 'Invalid event' }, 400);
    }

    const occurredMs = Date.parse(occurredAt);
    const nowMs = Date.now();
    if (
      typeof occurredAt !== 'string'
      || Number.isNaN(occurredMs)
      || occurredMs > nowMs + 24 * 60 * 60 * 1000
      || occurredMs < nowMs - 31 * 24 * 60 * 60 * 1000
    ) {
      logSafe('warn', { event: eventName, level, result: 'rejected', reason: 'invalid_timestamp' });
      return jsonResponse({ error: 'Invalid timestamp' }, 400);
    }

    let sanitizedDetails: Record<string, any> = {};
    try {
      if (details !== undefined && details !== null) {
        if (typeof details !== 'object' || Array.isArray(details)) {
          throw new Error('details shape');
        }
        sanitizedDetails = buildSanitizedDetails(details);
      }
    } catch {
      logSafe('warn', { event: eventName, level, result: 'rejected', reason: 'forbidden_field' });
      return jsonResponse({ error: 'Event contains forbidden fields' }, 400);
    }

    // Normalized outcome: prefer the client's explicit outcome, else derive
    // from level so the admin report always has a scannable value.
    const normalizedOutcome = (() => {
      if (typeof outcome === 'string' && outcome.length > 0) {
        return boundedString(outcome, 48);
      }
      if (typeof sanitizedDetails.outcome === 'string' && sanitizedDetails.outcome.length > 0) {
        return boundedString(sanitizedDetails.outcome, 48);
      }
      if (level === 'error') return 'error';
      if (level === 'warn') return 'warning';
      return 'ok';
    })();

    // Idempotency: the client outbox retries uploads, so an accepted event
    // must be re-acknowledged without writing a second row.
    let existing = [];
    try {
      existing = await base44.asServiceRole.entities.IosPurchaseDiagnostic.filter({
        event_id: eventId,
      });
    } catch {
      logSafe('error', { event: eventName, level, result: 'failed', reason: 'lookup_failed' });
      return jsonResponse({ error: 'Diagnostic lookup failed' }, 500);
    }
    if (existing && existing.length > 0) {
      return jsonResponse({ accepted: true, duplicate: true }, 200);
    }

    try {
      await base44.asServiceRole.entities.IosPurchaseDiagnostic.create({
        source: SOURCE,
        platform: PLATFORM,
        session_id: sessionId,
        event_id: eventId,
        user_id_hash: userIdHash,
        event_name: eventName,
        level,
        outcome: normalizedOutcome,
        occurred_at: new Date(occurredMs).toISOString(),
        details_json: serializeDetails(sanitizedDetails),
      });
    } catch {
      // Concurrent duplicate create — re-check before reporting failure so a
      // racing outbox retry is still idempotent.
      try {
        const again = await base44.asServiceRole.entities.IosPurchaseDiagnostic.filter({
          event_id: eventId,
        });
        if (again && again.length > 0) {
          return jsonResponse({ accepted: true, duplicate: true }, 200);
        }
      } catch {
        // fall through to the 500 below
      }
      logSafe('error', { event: eventName, level, result: 'failed', reason: 'write_failed' });
      return jsonResponse({ error: 'Diagnostic write failed' }, 500);
    }

    logSafe('info', { event: eventName, level, result: 'accepted', reason: 'created' });
    return jsonResponse({ accepted: true, duplicate: false }, 200);
  } catch {
    logSafe('error', { result: 'failed', reason: 'internal_error' });
    return jsonResponse({ error: 'Internal error' }, 500);
  }
}