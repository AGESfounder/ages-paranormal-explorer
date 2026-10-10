// Persistent iOS subscription purchase diagnostics (AGES_IOS_PURCHASE_DIAG).
// ---------------------------------------------------------------------------
// Companion to the console-only emitter in src/lib/revenuecat.js and to the
// Base44 function base44/functions/record-ios-purchase-diagnostic/entry.ts.
//
// What this module does:
//  - Owns the shared deterministic redaction token (hashIosDiagId) used by
//    the console emitter, the persisted rows, and the Admin dashboard query.
//  - Maintains ONE opaque random diagnostic session id per app purchase
//    attempt (in-memory only; never derived from any user/store identifier).
//  - Sanitizes each event to a fixed allowlist, enqueues it synchronously in
//    a bounded localStorage outbox (survives app close), and uploads it
//    asynchronously through the record-ios-purchase-diagnostic function.
//
// Hard guarantees:
//  - BEST-EFFORT ONLY. Every exported function is fail-safe and every upload
//    is fire-and-forget, so diagnostics can never throw into, await-block,
//    or change the outcome of a purchase, login, or render.
//  - REDACTED ONLY. Raw user ids, RevenueCat customer ids, transaction ids,
//    emails, passwords, API keys, tokens, and receipts are never persisted —
//    the outbox holds only allow-listed fields and id_XXXXXXXX hash tokens.
//  - iOS ONLY BY CONSTRUCTION. Events are produced solely by the iOS-gated
//    iosPurchaseDiag() emitter; this module adds no Android/web code paths.
// ---------------------------------------------------------------------------

import { base44 } from '@/api/base44Client';

/** Fixed markers — validated again server-side. */
export const IOS_PURCHASE_DIAG_SOURCE = 'AGES_IOS_PURCHASE_DIAG';
const IOS_PURCHASE_DIAG_PLATFORM = 'ios';

/** Durable outbox location (ages_* prefix matches existing app keys). */
const OUTBOX_STORAGE_KEY = 'ages_ios_purchase_diag_outbox';

/** Bounds: outbox length and per-flush work. */
const MAX_OUTBOX_EVENTS = 100;
const MAX_FLUSH_BATCH = 25;
const MAX_ATTEMPTS_PER_EVENT = 5;

const MAX_ERROR_MESSAGE = 240;
const MAX_SHORT_STRING = 160;
const MAX_ARRAY_ITEMS = 12;
const MAX_ARRAY_ITEM_LENGTH = 80;

const ALLOWED_LEVELS = new Set(['info', 'warn', 'error']);
const HASH_TOKEN_PATTERN = /^id_[0-9a-f]{8}$/;

/**
 * Persistent HTTP statuses: event can never be accepted — drop it. 401 is
 * deliberately TRANSIENT (an expired token may succeed after the next
 * sign-in); the per-event attempts cap still bounds total retention.
 */
const PERMANENT_FAILURE_STATUSES = new Set([400, 403, 404, 405, 422]);

/**
 * Keys naming sensitive shapes (mirrors the server list). The client drops
 * these up front so the LOCAL outbox never holds sensitive data even before
 * the server would reject the event.
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

/** Detail key allowlist (mirror of the server — the server stays authority). */
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
 * Deterministic redaction hash (FNV-1a 32-bit) so diagnostic lines and stored
 * rows can correlate a user id / RevenueCat customer id / transaction id
 * across events and sessions without ever persisting the raw id. Redaction
 * token only — NOT a cryptographic boundary. The SAME algorithm runs in the
 * record function (server-side canonical hash) and the Admin dashboard
 * (query filter). Returns null for empty input.
 *
 * @param {unknown} value raw id to redact
 * @returns {string | null} stable token (e.g. "id_9e3779b9") or null
 */
export function hashIosDiagId(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `id_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/* ── In-memory session/user context (NEVER persisted raw) ─────────────────── */

/** @type {string | null} opaque random session id for the current attempt */
let currentSessionId = null;
/**
 * Raw Base44 user id of the current attempt, held in MEMORY ONLY to compute
 * the expected hash token stamped on each event. Never written to the
 * outbox, logs, or any persisted field.
 * @type {string | null}
 */
let currentSubjectId = null;

function randomHex(bytes = 8) {
  try {
    const buf = new Uint8Array(bytes);
    const cryptoObj = /** @type {Crypto | undefined} */ (globalThis.crypto);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(buf);
      return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fall through to Math.random
  }
  let out = '';
  for (let i = 0; i < bytes * 2; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/**
 * Start a new opaque diagnostic session for one iOS subscription purchase
 * attempt. Called by the Dashboard immediately before the existing
 * dashboard.purchase_start diagnostic, with the signed-in user's id so the
 * expected-subject token can be computed per event. Returns the session id.
 * Never throws.
 *
 * @param {string | null | undefined} userId Base44 user id (raw — held in
 *   memory only, never persisted)
 * @returns {string | null} the new opaque session id (s_...)
 */
export function beginIosPurchaseDiagSession(userId) {
  try {
    currentSessionId = `s_${randomHex(8)}`;
    currentSubjectId = userId ? String(userId) : null;
    return currentSessionId;
  } catch {
    return null;
  }
}

/**
 * Ensure a session exists for defensive emitters that fire outside an
 * explicit Dashboard start (no raw subject is known in that case; the
 * server then tags the authenticated uploader). Never throws.
 *
 * @returns {string | null}
 */
export function ensureIosPurchaseDiagSession() {
  try {
    if (!currentSessionId) {
      currentSessionId = `s_${randomHex(8)}`;
    }
    return currentSessionId;
  } catch {
    return null;
  }
}

/**
 * Clear ONLY in-memory diagnostic session context on logout. The durable
 * outbox is intentionally kept: queued events still carry their expected
 * subject token and the server accepts them only for the matching account,
 * so a stale queue can never be attributed to a different user.
 */
export function clearIosPurchaseDiagSession() {
  try {
    currentSessionId = null;
    currentSubjectId = null;
  } catch {
    // diagnostics must never break logout
  }
}

/* ── Detail sanitization (client-side first pass; server re-validates) ────── */

/**
 * @param {string} key
 * @returns {boolean} true when the key names a sensitive/raw-id shape
 */
function isForbiddenKey(key) {
  const lowered = String(key).toLowerCase();
  return FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(lowered));
}

/**
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string}
 */
function boundedString(value, maxLength = MAX_SHORT_STRING) {
  return String(value).slice(0, maxLength);
}

/**
 * @param {string} text
 * @returns {string} text with non-printable / non-ASCII bytes collapsed
 */
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
 * Scrub free-form error text: strip emails, bearer/JWT-like tokens, long
 * token-ish runs, UUIDs, and control bytes, then cap length. The same
 * scrubbing runs again server-side before storage.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function scrubIosDiagErrorText(value) {
  try {
    let text = String(value);
    text = text.replace(/[\S]+@[\S]+\.[\S]+/g, '[redacted-email]');
    text = text.replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, '[redacted-token]');
    text = text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_.~-]+\.[A-Za-z0-9_.~-]*/g, '[redacted-jwt]');
    text = text.replace(/[A-Za-z0-9_+/-]{48,}={0,2}/g, '[redacted]');
    text = text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[redacted-uuid]');
    text = stripControlChars(text);
    return text.trim().slice(0, MAX_ERROR_MESSAGE);
  } catch {
    return '';
  }
}

/**
 * Reduce an arbitrary details object to the sanitized allowlist. Unknown and
 * sensitive-shaped keys are dropped; values are type-checked and bounded.
 * Never throws.
 *
 * @param {Record<string, unknown> | null | undefined} details
 * @returns {Record<string, unknown>}
 */
export function sanitizeIosDiagDetails(details) {
  /** @type {Record<string, unknown>} */
  const out = {};
  try {
    if (!details || typeof details !== 'object' || Array.isArray(details)) return out;
    for (const [key, value] of Object.entries(details)) {
      try {
        if (isForbiddenKey(key) || value === null || value === undefined) continue;

        if (STRING_KEYS.has(key)) {
          if (typeof value === 'string' || typeof value === 'number') {
            out[key] = boundedString(value);
          }
          continue;
        }
        if (HASH_KEYS.has(key)) {
          // Only a valid redaction token survives — never a raw id.
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
          if (Number.isFinite(Number(value))) out[key] = Math.trunc(Number(value));
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
          if (typeof value === 'string') out[key] = scrubIosDiagErrorText(value);
          continue;
        }
        // Unknown key — dropped.
      } catch {
        // a single bad field must not break the event
      }
    }
  } catch {
    // fall through with whatever was collected
  }
  return out;
}

/* ── Bounded durable outbox (localStorage) ────────────────────────────────── */

/**
 * @typedef {Object} IosDiagOutboxEntry
 * @property {{ source: string, platform: string, session_id: string | null,
 *   event_id: string, event_name: string, level: string, outcome: string,
 *   occurred_at: string, details: Record<string, unknown> }} event
 * @property {string | null} expected_user_hash
 * @property {number} attempts
 */

/**
 * @returns {IosDiagOutboxEntry[]}
 */
function readOutbox() {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) => entry
        && typeof entry === 'object'
        && entry.event
        && typeof entry.event.event_id === 'string'
        && typeof entry.event.event_name === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * @param {IosDiagOutboxEntry[]} entries
 */
function writeOutbox(entries) {
  try {
    if (!entries.length) {
      localStorage.removeItem(OUTBOX_STORAGE_KEY);
      return;
    }
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_OUTBOX_EVENTS)));
  } catch {
    // storage full/unavailable — diagnostics stay in memory only this session
  }
}

/**
 * Record one sanitized iOS purchase diagnostic for durable reporting.
 * Enqueues synchronously (survives app close), then kicks an asynchronous
 * best-effort upload. NEVER throws, NEVER returns an awaited promise, and
 * MUST NOT be called in a way that gates purchase behavior.
 *
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} eventName
 * @param {Record<string, unknown>} [details]
 */
export function recordIosPurchaseDiagnostic(level, eventName, details) {
  try {
    if (typeof eventName !== 'string' || !eventName) return;

    const sessionId = ensureIosPurchaseDiagSession();
    const sanitizedDetails = sanitizeIosDiagDetails(details);
    const normalizedLevel = ALLOWED_LEVELS.has(level) ? level : 'info';
    const rawOutcome = sanitizedDetails.outcome;
    const outcome = typeof rawOutcome === 'string' && rawOutcome
      ? boundedString(rawOutcome, 48)
      : normalizedLevel === 'error'
        ? 'error'
        : normalizedLevel === 'warn'
          ? 'warning'
          : 'ok';

    /** @type {IosDiagOutboxEntry} */
    const entry = {
      event: {
        source: IOS_PURCHASE_DIAG_SOURCE,
        platform: IOS_PURCHASE_DIAG_PLATFORM,
        session_id: sessionId,
        event_id: `e_${randomHex(8)}`,
        event_name: boundedString(eventName, 48),
        level: normalizedLevel,
        outcome,
        occurred_at: new Date().toISOString(),
        details: sanitizedDetails,
      },
      expected_user_hash: hashIosDiagId(currentSubjectId),
      attempts: 0,
    };

    const outbox = readOutbox();
    outbox.push(entry);
    if (outbox.length > MAX_OUTBOX_EVENTS) {
      outbox.splice(0, outbox.length - MAX_OUTBOX_EVENTS);
    }
    writeOutbox(outbox);
  } catch {
    // diagnostics must never break the caller
    return;
  }

  // Fire-and-forget upload — purchase code paths never await diagnostics.
  flushIosPurchaseDiagOutbox().catch(() => {});
}

/**
 * @param {unknown} error
 * @returns {number | null} HTTP status of a failed functions.invoke, if any
 */
function extractInvokeStatus(error) {
  const anyErr = /** @type {any} */ (error);
  const status = anyErr?.status ?? anyErr?.response?.status ?? null;
  return Number.isFinite(Number(status)) ? Number(status) : null;
}

let flushInFlight = false;
let flushAgainRequested = false;

/**
 * Upload queued diagnostic events best-effort. Accepted (or permanently
 * rejected) events are removed; transient failures stay queued for the next
 * flush (next event or next authenticated app start). Bounded work per call
 * and attempt-capped so a dead backend cannot wedge the outbox. Never throws,
 * never blocks UI — callers fire-and-forget it.
 *
 * @returns {Promise<void>}
 */
export async function flushIosPurchaseDiagOutbox() {
  if (flushInFlight) {
    flushAgainRequested = true;
    return;
  }
  flushInFlight = true;
  try {
    do {
      flushAgainRequested = false;

      let outbox = readOutbox();
      if (!outbox.length) return;

      const batch = outbox.slice(0, MAX_FLUSH_BATCH);
      const doneIds = new Set();
      let mutated = false;

      for (const entry of batch) {
        try {
          const res = await base44.functions.invoke('record-ios-purchase-diagnostic', {
            event: entry.event,
            expected_user_hash: entry.expected_user_hash,
          });
          if (res?.data?.accepted === true) {
            doneIds.add(entry.event.event_id);
            mutated = true;
          }
        } catch (error) {
          const status = extractInvokeStatus(error);
          entry.attempts = (entry.attempts || 0) + 1;
          mutated = true;
          if (
            (status !== null && PERMANENT_FAILURE_STATUSES.has(status))
            || entry.attempts >= MAX_ATTEMPTS_PER_EVENT
          ) {
            // The server will never accept this event (invalid payload,
            // subject mismatch, undeployed function) or it has failed too
            // many times — drop it so the outbox stays healthy.
            doneIds.add(entry.event.event_id);
          }
        }
      }

      if (mutated) {
        outbox = readOutbox();
        const remaining = outbox.filter((entry) => {
          if (doneIds.has(entry.event.event_id)) return false;
          // Carry over the bumped attempt counters for events we processed.
          for (const processed of batch) {
            if (processed.event.event_id === entry.event.event_id) {
              entry.attempts = processed.attempts;
              break;
            }
          }
          return true;
        });
        writeOutbox(remaining);
      }

      // Events recorded while this flush was running get one more pass so
      // the tail of a purchase sequence uploads promptly. Each pass is
      // bounded by MAX_FLUSH_BATCH and requests only arrive from real
      // recording, so this cannot spin indefinitely.
    } while (flushAgainRequested && readOutbox().length > 0);
  } catch {
    // diagnostics must never break the caller
  } finally {
    flushInFlight = false;
    flushAgainRequested = false;
  }
}

/** Outbox depth — diagnostics/support use only. Never throws. */
export function getIosPurchaseDiagOutboxSize() {
  try {
    return readOutbox().length;
  } catch {
    return 0;
  }
}