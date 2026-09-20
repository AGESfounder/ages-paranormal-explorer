//
// ⚠️ TEMPORARY — TESTFLIGHT DIAGNOSTICS ONLY (iOS Build 11). REMOVE BEFORE RELEASE.
//
// In-memory AdMob diagnostics: an event log plus a status snapshot, rendered by
// src/components/AdDiagnosticsPanel.jsx so testers without a Mac/Xcode can see
// what the AdMob plugin did (plugin registration, initialize, UMP consent, ATT,
// interstitial/rewarded load & presentation, error codes/messages) directly in
// the app.
//
// Pure instrumentation: no network, no persistence, no new dependencies, and
// every exported function is fail-safe so a diagnostics problem can NEVER
// change ad behavior, consent decisions, or gating semantics.
//
// Removal checklist: delete this file and src/components/AdDiagnosticsPanel.jsx,
// remove <AdDiagnosticsPanel /> from src/pages/Settings.jsx, and remove the
// recordAdDiag/setAdDiagStatus/describeAdError calls from src/lib/adService.js
// (all marked with "TEMP DIAG").
//

import { Capacitor } from '@capacitor/core';

/** Keep the log bounded — diagnostics are session-scoped and in-memory only. */
const MAX_EVENTS = 150;

/**
 * @typedef {Object} AdDiagEvent
 * @property {number} id
 * @property {number} ts epoch ms
 * @property {string} scope e.g. 'init' | 'plugin' | 'consent' | 'att' | 'interstitial' | 'rewarded'
 * @property {string} phase e.g. 'start' | 'loaded' | 'show-failed'
 * @property {boolean | null} ok true/false for success/failure, null for info
 * @property {string} message human-readable summary
 * @property {Record<string, any> | null} data small structured detail (ad unit id, error code/message, consent fields)
 */

/** @type {AdDiagEvent[]} */
let events = [];
let nextId = 1;

/**
 * Latest known AdMob status. All values are observational copies — the real
 * state lives in src/lib/adService.js and is never mutated from here.
 */
let status = {
  platform: 'unknown',
  /** Capacitor plugin registration probe result (true/false/null=unknown). */
  pluginAvailable: null,
  /** AdMob JS proxy methods that were missing at probe time. */
  pluginMissingMethods: /** @type {string[]} */ ([]),
  /** 'idle' | 'running' | 'ready' | 'blocked' (consent gate) | 'failed' */
  initState: 'idle',
  adsAllowed: null,
  requestNonPersonalized: null,
  consentStatus: null,
  consentFormAvailable: null,
  canRequestAds: null,
  privacyOptionsRequirementStatus: null,
  attStatus: null,
  interstitialAdId: null,
  rewardedAdId: null,
  /** Last initialization error { code, message } if any. */
  lastError: null,
};

// Cached snapshot so useSyncExternalStore gets a stable reference between
// mutations (a fresh object per call would loop forever).
let snapshot = { status: { ...status }, events: [] };
const listeners = new Set();

function notify() {
  snapshot = { status: { ...status }, events: [...events] };
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // a broken listener must not affect diagnostics or ads
    }
  });
}

/**
 * Append an event to the diagnostics log. Never throws.
 * @param {string} scope
 * @param {string} phase
 * @param {{ ok?: boolean | null, message?: string, data?: Record<string, any> | null }} [entry]
 */
export function recordAdDiag(scope, phase, { ok = null, message = '', data = null } = {}) {
  try {
    events.push({ id: nextId++, ts: Date.now(), scope, phase, ok, message, data });
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }
    notify();
  } catch {
    // diagnostics must never break the caller
  }
}

/**
 * Merge fields into the status snapshot. Never throws.
 * @param {Partial<typeof status>} patch
 */
export function setAdDiagStatus(patch) {
  try {
    status = { ...status, ...patch };
    notify();
  } catch {
    // diagnostics must never break the caller
  }
}

/** Current snapshot (stable reference between mutations). */
export function getAdDiagSnapshot() {
  return snapshot;
}

/**
 * Subscribe to diagnostics changes. Returns an unsubscribe function.
 * @param {() => void} listener
 */
export function subscribeAdDiag(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Clear the event log (status snapshot is kept). Never throws. */
export function clearAdDiagEvents() {
  try {
    events = [];
    notify();
  } catch {
    // ignore
  }
}

/**
 * Normalize a Capacitor/plugin error into a display-safe shape. Also flags
 * "plugin/method not implemented" style failures so missing native
 * registration is obvious in the panel. Never throws.
 * @param {unknown} error
 * @returns {{ code: string | null, message: string, missingMethod: boolean }}
 */
export function describeAdError(error) {
  try {
    if (error == null) {
      return { code: null, message: 'Unknown error (null/undefined)', missingMethod: false };
    }
    if (typeof error === 'string') {
      return { code: null, message: error, missingMethod: false };
    }
    const anyErr = /** @type {Record<string, any>} */ (error);
    const rawCode = anyErr.code ?? anyErr.errorCode ?? anyErr.status ?? null;
    const code = rawCode != null ? String(rawCode) : null;
    let message =
      anyErr.message ||
      anyErr.errorMessage ||
      anyErr.msg ||
      (() => {
        try {
          return JSON.stringify(anyErr);
        } catch {
          return String(error);
        }
      })();
    message = String(message);
    const missingMethod =
      /not implemented|unimplemented|no such method|is not a function|undefined is not|plugin .* not (found|registered|available)/i.test(
        message,
      ) || (code || '').toUpperCase() === 'UNIMPLEMENTED';
    return { code, message, missingMethod };
  } catch {
    return { code: null, message: 'Unserializable error object', missingMethod: false };
  }
}

/**
 * Probe Capacitor AdMob plugin registration/availability. Read-only. Never
 * throws. Missing JS proxy methods usually mean the plugin code is absent;
 * `available === false` on native means the plugin is not registered natively.
 * @param {Record<string, any> | null | undefined} adMobPlugin the imported AdMob proxy
 * @returns {{ available: boolean | null, missingMethods: string[], error?: string }}
 */
export function probeAdMobPlugin(adMobPlugin) {
  /** @type {{ available: boolean | null, missingMethods: string[], error?: string }} */
  const result = { available: null, missingMethods: [] };
  try {
    result.available =
      typeof Capacitor.isPluginAvailable === 'function'
        ? Capacitor.isPluginAvailable('AdMob')
        : null;
  } catch (e) {
    result.available = null;
    result.error = describeAdError(e).message;
  }
  try {
    const methods = [
      'initialize',
      'requestConsentInfo',
      'showConsentForm',
      'trackingAuthorizationStatus',
      'requestTrackingAuthorization',
      'prepareInterstitial',
      'showInterstitial',
      'prepareRewardVideoAd',
      'showRewardVideoAd',
    ];
    for (const name of methods) {
      if (typeof adMobPlugin?.[name] !== 'function') {
        result.missingMethods.push(name);
      }
    }
  } catch {
    // ignore — availability probe above is the primary signal
  }
  return result;
}

/**
 * Extract the known, non-secret fields from a UMP consent response. Defensive:
 * captures whatever the installed plugin version actually returns.
 * @param {Record<string, any> | null | undefined} consentInfo
 * @returns {Record<string, any> | null}
 */
export function extractConsentInfo(consentInfo) {
  try {
    if (!consentInfo || typeof consentInfo !== 'object') return null;
    const out = /** @type {Record<string, any>} */ ({});
    if ('status' in consentInfo) out.status = consentInfo.status;
    if ('isConsentFormAvailable' in consentInfo) {
      out.isConsentFormAvailable = consentInfo.isConsentFormAvailable;
    }
    if ('canRequestAds' in consentInfo) out.canRequestAds = consentInfo.canRequestAds;
    if ('privacyOptionsRequirementStatus' in consentInfo) {
      out.privacyOptionsRequirementStatus = consentInfo.privacyOptionsRequirementStatus;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Map a UMP consent response onto status-snapshot fields. Never throws.
 * @param {Record<string, any> | null | undefined} consentInfo
 */
export function consentStatusPatch(consentInfo) {
  const info = extractConsentInfo(consentInfo) || {};
  return {
    consentStatus: info.status ?? null,
    consentFormAvailable: info.isConsentFormAvailable ?? null,
    canRequestAds: info.canRequestAds ?? null,
    privacyOptionsRequirementStatus: info.privacyOptionsRequirementStatus ?? null,
  };
}

function formatTime(ts) {
  try {
    return new Date(ts).toTimeString().slice(0, 8);
  } catch {
    return '--:--:--';
  }
}

/**
 * Build a plain-text report (status + events) for copy/paste into a support
 * message. No secrets — ad unit IDs are public configuration. Never throws.
 * @param {{ appLabel?: string }} [extra]
 * @returns {string}
 */
export function buildAdDiagReport(extra = {}) {
  try {
    const { status: s, events: evts } = getAdDiagSnapshot();
    const lines = [];
    lines.push('AGES Explorer — Ad Diagnostics Report (TEMPORARY TESTFLIGHT PANEL)');
    if (extra.appLabel) lines.push(`App: ${extra.appLabel}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('STATUS');
    lines.push(`- platform: ${s.platform}`);
    lines.push(`- pluginAvailable: ${fmtVal(s.pluginAvailable)}`);
    lines.push(
      `- pluginMissingMethods: ${s.pluginMissingMethods?.length ? s.pluginMissingMethods.join(', ') : 'none'}`,
    );
    lines.push(`- initState: ${s.initState}`);
    lines.push(`- adsAllowed: ${fmtVal(s.adsAllowed)}`);
    lines.push(`- requestNonPersonalized: ${fmtVal(s.requestNonPersonalized)}`);
    lines.push(`- consentStatus: ${fmtVal(s.consentStatus)}`);
    lines.push(`- consentFormAvailable: ${fmtVal(s.consentFormAvailable)}`);
    lines.push(`- canRequestAds: ${fmtVal(s.canRequestAds)}`);
    lines.push(`- privacyOptionsRequirementStatus: ${fmtVal(s.privacyOptionsRequirementStatus)}`);
    lines.push(`- attStatus: ${fmtVal(s.attStatus)}`);
    lines.push(`- interstitialAdId: ${fmtVal(s.interstitialAdId)}`);
    lines.push(`- rewardedAdId: ${fmtVal(s.rewardedAdId)}`);
    if (s.lastError) {
      lines.push(`- lastError: ${s.lastError.code ? `[${s.lastError.code}] ` : ''}${s.lastError.message}`);
    }
    lines.push('');
    lines.push(`EVENTS (${evts.length}, oldest first)`);
    for (const e of evts) {
      const okLabel = e.ok === true ? 'OK  ' : e.ok === false ? 'FAIL' : 'info';
      lines.push(`[${formatTime(e.ts)}] ${okLabel} ${e.scope}:${e.phase} — ${e.message}`);
      if (e.data) {
        try {
          lines.push(`    data: ${JSON.stringify(e.data)}`);
        } catch {
          // skip unserializable detail
        }
      }
    }
    return lines.join('\n');
  } catch (e) {
    return `Failed to build diagnostics report: ${describeAdError(e).message}`;
  }
}

function fmtVal(v) {
  if (v === null || v === undefined) return 'unknown';
  if (v === true) return 'true';
  if (v === false) return 'false';
  return String(v);
}