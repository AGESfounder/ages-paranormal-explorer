import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

// Session-only, keyed by recording identity. Never persist or upload reports.
const reports = new WeakMap();
const savePlugin = registerPlugin('AgesSaveToDevice');
const stages = ['preparation', 'inspection', 'transformation', 'validation', 'staging', 'mediaStore', 'outputRead'];
const numericKeys = ['androidApi', 'requestedTrimMs', 'expectedDurationMs', 'sourceDurationMs', 'outputDurationMs', 'sourceBytes', 'outputBytes', 'exportErrorCode'];
const booleanKeys = ['sourceHasAudio', 'sourceHasVideo', 'sourceHasAacAudio', 'sourceHasH264Video', 'outputHasAudio', 'outputHasVideo', 'outputHasAacAudio', 'outputHasH264Video', 'partialRowDeleted'];

export function safeNativeSaveData(data) {
  const safe = {};
  if (stages.includes(data?.stage)) safe.stage = data.stage;
  for (const key of numericKeys) {
    if (typeof data?.[key] === 'number' && Number.isFinite(data[key]) && data[key] >= 0) safe[key] = data[key];
  }
  for (const key of booleanKeys) {
    if (typeof data?.[key] === 'boolean') safe[key] = data[key];
  }
  return safe;
}

export const safeNativeSaveCode = (code) => typeof code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(code) ? code : 'unavailable';
// Exact static recording messages only. Arbitrary OS/provider exceptions can
// contain paths or other private values, so redacting a few patterns is unsafe.
const publicMessages = new Set([
  'Storage permission was denied. Allow storage access in app settings to save to the Gallery.',
  'The recording file is missing.',
  'Only audio and video recordings can be prepared.',
  'The recording file could not be found or is empty.',
  'The selected trim duration is invalid. The original recording is unchanged.',
  'This recording has no readable audio track. The original is unchanged.',
  'This recording has no readable video track. The original is unchanged.',
  'This WebM trim is too large to process safely on this device. The original is unchanged. Try a shorter recording.',
  "Android could not read this recording's duration or media tracks. The original is unchanged. Try again with a shorter recording.",
  'Android could not convert this recording. Your original is unchanged. Try again with a shorter recording.',
  'Android could not start the recording export. Your original is unchanged. Try again.',
  'Android did not produce a valid MP4 file. The original is unchanged. Try again.',
  'Android could not verify a positive export duration. The original is unchanged. Try again.',
  'The audio export did not contain a valid AAC track. The original is unchanged. Try again.',
  'The video export did not contain the expected MP4 tracks. The original is unchanged. Try again.',
  'The prepared clip did not match its expected duration. The original is unchanged. Try again with a shorter recording.',
  'Android could not verify the exported recording. The original is unchanged. Try again with a shorter recording.',
  'The recording has no readable audio or video tracks. The original is unchanged.',
  'The recording could not be read on this Android device. The original is unchanged. Try again with a shorter recording.',
  'This recording is too long to inspect safely on this device. The original is unchanged. Try a shorter recording.',
  "Android could not reconcile this recording's duration metadata and sample timeline. The original is unchanged. Try again with a shorter recording.",
  'The staged recording could not be found. Your original is unchanged. Try again.',
  'Android could not save the recording to its media collection. Your original is unchanged. Check storage space and try again.',
  'The recording format could not be identified. Your original is still available.',
  'The device did not return a prepared recording. Your original is still available. Retry preparation.',
  'The prepared recording is empty.',
  'The device copy did not match the recording. Nothing was saved.',
  'The recording could not be read.',
  'The device did not confirm the save.',
]);
const safeMessage = (message) => publicMessages.has(message) ? message : 'Unrecognized platform error message withheld for privacy. Retry the save.';
const safeMime = (blob) => /^(audio|video|image)\/[a-z0-9.+-]+$/i.test(blob?.type?.split(';')[0] || '') ? blob.type.split(';')[0].toLowerCase() : 'unknown';

export function rememberAndroidSaveMetrics(blob, data) {
  if (Capacitor.getPlatform() === 'android' && blob) reports.set(blob, { data: safeNativeSaveData(data) });
}

export function rememberAndroidSaveFailure(blob, error, stage = 'preparation', trimSeconds = null) {
  if (Capacitor.getPlatform() !== 'android' || !blob) return;
  const data = { ...reports.get(blob)?.data, ...safeNativeSaveData(error?.data) };
  data.stage = safeNativeSaveData(error?.data).stage || (stages.includes(stage) ? stage : 'preparation');
  if (typeof trimSeconds === 'number' && Number.isFinite(trimSeconds) && trimSeconds > 0) data.requestedTrimMs = trimSeconds * 1000;
  reports.set(blob, {
    data,
    nativeErrorCode: safeNativeSaveCode(error?.nativeCode || error?.code),
    nativeErrorMessage: safeMessage(error?.message),
  });
}

export async function buildAndroidSaveReport(blob, fallbackMessage) {
  if (Capacitor.getPlatform() !== 'android') return '';
  const saved = reports.get(blob) || {};
  const [app, info] = await Promise.all([
    App.getInfo().catch(() => null),
    savePlugin.getSaveInfo().catch(() => null),
  ]);
  return JSON.stringify({
    report: 'AGES Android save failure',
    appVersion: /^[0-9.]+$/.test(app?.version || '') ? app.version : 'unavailable',
    build: /^\d+$/.test(app?.build || '') ? app.build : 'unavailable',
    androidApi: safeNativeSaveData(info).androidApi || saved.data?.androidApi || 'unavailable',
    sourceMime: safeMime(blob),
    sourceBytes: blob?.size || 0,
    ...saved,
    nativeErrorMessage: saved.nativeErrorMessage || safeMessage(fallbackMessage),
    nativeErrorCode: saved.nativeErrorCode || 'unavailable',
    stage: saved.data?.stage || 'preparation',
  }, null, 2);
}

export async function copySaveReport(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* Older WebViews can still use the selection-based fallback. */ }
  const textarea = document.createElement('textarea');
  const focused = document.activeElement;
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (focused instanceof HTMLElement) focused.focus();
  }
}