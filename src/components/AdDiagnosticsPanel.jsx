//
// ⚠️ TEMPORARY — TESTFLIGHT DIAGNOSTICS ONLY (iOS Build 11). REMOVE BEFORE RELEASE.
//
// User-visible AdMob diagnostics surface for testers without a Mac/Xcode.
// Renders only inside the native iOS shell (web/Android render nothing).
// Read-only: it displays the in-memory log + status recorded by
// src/lib/adDiagnostics.js via the TEMP DIAG instrumentation in
// src/lib/adService.js. It never calls AdMob, never changes consent/ads.
//
// Removal: delete this file and its usage in src/pages/Settings.jsx.
//

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { AdMob } from '@capacitor-community/admob';
import { AlertTriangle, Check, Copy, FlaskConical, RefreshCw, Trash2 } from 'lucide-react';
import {
  buildAdDiagReport,
  clearAdDiagEvents,
  getAdDiagSnapshot,
  probeAdMobPlugin,
  recordAdDiag,
  setAdDiagStatus,
  subscribeAdDiag,
} from '@/lib/adDiagnostics';

function isNativeIos() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

function formatTime(ts) {
  try {
    return new Date(ts).toTimeString().slice(0, 8);
  } catch {
    return '--:--:--';
  }
}

/** Display helper: unknown → muted dash, booleans → Yes/No, else string. */
function displayValue(value) {
  if (value === null || value === undefined || value === '') return { text: '—', tone: 'muted' };
  if (value === true) return { text: 'Yes', tone: 'ok' };
  if (value === false) return { text: 'No', tone: 'bad' };
  return { text: String(value), tone: 'plain' };
}

const toneClass = {
  ok: 'text-emerald-400',
  bad: 'text-red-400',
  warn: 'text-amber-400',
  muted: 'text-muted-foreground',
  plain: 'text-foreground',
};

/**
 * @param {{ label: string, value: any, tone?: 'ok' | 'bad' | 'warn' | 'muted' | 'plain', mono?: boolean }} props
 */
function StatusRow({ label, value, tone, mono }) {
  const shown = tone ? { text: String(value), tone } : displayValue(value);
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span
        className={`text-[11px] text-right ${toneClass[shown.tone] || toneClass.plain} ${mono ? 'font-mono break-all' : ''}`}
      >
        {shown.text}
      </span>
    </div>
  );
}

function initStateTone(initState) {
  if (initState === 'ready') return 'ok';
  if (initState === 'failed') return 'bad';
  if (initState === 'blocked') return 'warn';
  return 'plain';
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export default function AdDiagnosticsPanel() {
  // All hooks run unconditionally; the native-iOS gate happens after them.
  const [isIos] = useState(isNativeIos);
  const snapshot = useSyncExternalStore(subscribeAdDiag, getAdDiagSnapshot, getAdDiagSnapshot);
  const [appLabel, setAppLabel] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isIos) return;
    let cancelled = false;
    App.getInfo()
      .then((info) => {
        if (cancelled) return;
        setAppLabel(`${info.name} ${info.version} (build ${info.build})`);
      })
      .catch(() => {
        if (!cancelled) setAppLabel('');
      });
    return () => {
      cancelled = true;
    };
  }, [isIos]);

  if (!isIos) return null;

  const { status, events } = snapshot;
  const orderedEvents = [...events].reverse();

  const handleRefresh = () => {
    const probe = probeAdMobPlugin(AdMob);
    setAdDiagStatus({
      platform: Capacitor.getPlatform(),
      pluginAvailable: probe.available,
      pluginMissingMethods: probe.missingMethods,
    });
    recordAdDiag('plugin', 'manual-refresh', {
      ok: probe.available !== false && probe.missingMethods.length === 0,
      message:
        probe.available === false
          ? 'Manual refresh: AdMob plugin NOT registered/available in the native shell.'
          : probe.missingMethods.length
            ? `Manual refresh: missing methods: ${probe.missingMethods.join(', ')}`
            : 'Manual refresh: AdMob plugin registered, all probed methods present.',
      data: { available: probe.available, missingMethods: probe.missingMethods },
    });
    App.getInfo()
      .then((info) => setAppLabel(`${info.name} ${info.version} (build ${info.build})`))
      .catch(() => {});
  };

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(buildAdDiagReport({ appLabel }));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 overflow-hidden">
      <div className="p-3 border-b border-amber-500/20">
        <h3 className="text-xs font-heading uppercase tracking-wider text-amber-400 flex items-center gap-2">
          <FlaskConical className="w-3.5 h-3.5" /> Ad Diagnostics
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[9px] font-heading uppercase tracking-wider text-amber-300">
            <AlertTriangle className="w-2.5 h-2.5" /> Temporary
          </span>
        </h3>
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
          Temporary TestFlight panel (iOS Build 11) — removed before release. It records what the
          AdMob plugin does on this device: initialization, consent, tracking prompt, and ad
          loads/errors. Take a screenshot or use “Copy report” to share it with support.
        </p>
        {appLabel ? (
          <p className="text-[10px] font-mono text-amber-300/80 mt-1">{appLabel}</p>
        ) : null}
      </div>

      {/* Status snapshot */}
      <div className="p-3 border-b border-amber-500/20">
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1">
          Status
        </p>
        <StatusRow label="Platform" value={status.platform} />
        <StatusRow
          label="AdMob plugin registered"
          value={status.pluginAvailable}
          tone={
            status.pluginAvailable === true
              ? 'ok'
              : status.pluginAvailable === false
                ? 'bad'
                : undefined
          }
        />
        <StatusRow
          label="Missing plugin methods"
          value={status.pluginMissingMethods?.length ? status.pluginMissingMethods.join(', ') : 'none'}
          tone={status.pluginMissingMethods?.length ? 'bad' : 'ok'}
        />
        <StatusRow label="Init state" value={status.initState} tone={initStateTone(status.initState)} />
        <StatusRow label="Ads allowed" value={status.adsAllowed} />
        <StatusRow label="UMP consent status" value={status.consentStatus} />
        <StatusRow label="Consent form available" value={status.consentFormAvailable} />
        <StatusRow label="UMP canRequestAds" value={status.canRequestAds} />
        <StatusRow
          label="Privacy options requirement"
          value={status.privacyOptionsRequirementStatus}
        />
        <StatusRow label="ATT status" value={status.attStatus} />
        <StatusRow label="Non-personalized ads (NPA)" value={status.requestNonPersonalized} />
        <StatusRow label="Interstitial unit" value={status.interstitialAdId} mono />
        <StatusRow label="Rewarded unit" value={status.rewardedAdId} mono />
        {status.lastError ? (
          <div className="mt-1 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
            <p className="text-[10px] text-red-400 font-heading uppercase tracking-wider">
              Last init error
            </p>
            <p className="text-[11px] font-mono text-red-300 break-all mt-0.5">
              {status.lastError.code ? `[${status.lastError.code}] ` : ''}
              {status.lastError.message}
            </p>
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="p-3 flex items-center gap-2 border-b border-amber-500/20">
        <button
          type="button"
          onClick={handleRefresh}
          className="px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] font-heading uppercase tracking-wider hover:bg-amber-500/20 transition-colors min-h-[44px] flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh status
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] font-heading uppercase tracking-wider hover:bg-amber-500/20 transition-colors min-h-[44px] flex items-center gap-1.5"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copy report
            </>
          )}
        </button>
        <button
          type="button"
          onClick={clearAdDiagEvents}
          className="px-3 py-2 rounded-lg text-muted-foreground text-[11px] font-heading uppercase tracking-wider hover:bg-primary/5 transition-colors min-h-[44px] flex items-center gap-1.5 ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear log
        </button>
      </div>

      {/* Event log */}
      <div className="p-3">
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
          Recent events ({events.length})
        </p>
        {orderedEvents.length === 0 ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            No AdMob events recorded yet this session. Launch/consent events appear when the app
            starts; ad events appear after opening a stop’s Paranormal tab or watching a reward ad.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {orderedEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-lg border border-border/30 bg-card/40 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      event.ok === true
                        ? 'bg-emerald-400'
                        : event.ok === false
                          ? 'bg-red-400'
                          : 'bg-slate-500'
                    }`}
                  />
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {formatTime(event.ts)}
                  </span>
                  <span
                    className={`text-[10px] font-heading uppercase tracking-wider ${
                      event.ok === false ? 'text-red-400' : 'text-foreground/80'
                    }`}
                  >
                    {event.scope}:{event.phase}
                  </span>
                </div>
                <p
                  className={`text-[11px] leading-snug mt-0.5 ${
                    event.ok === false ? 'text-red-300' : 'text-foreground/90'
                  }`}
                >
                  {event.message}
                </p>
                {event.data ? (
                  <p className="text-[9px] font-mono text-muted-foreground/80 break-all mt-0.5">
                    {safeJson(event.data)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function safeJson(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return '[unserializable detail]';
  }
}