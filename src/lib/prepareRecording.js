import { Capacitor } from '@capacitor/core';
import { baseMediaMime, exportNativeRecording } from '@/lib/deviceMedia';
import { exportBrowserRecording } from '@/lib/browserRecordingExport';
import { rememberAndroidSaveFailure, rememberAndroidSaveMetrics, safeNativeSaveData } from '@/lib/androidSaveDiagnostics';

const exportsBySource = new WeakMap();
const preparedBlobs = new WeakSet();
const preparedTrimIntents = new WeakMap();

// Unknown is backward-compatible metadata for callers without an explicit UI
// mode. Never infer Brief (or Full) from a numeric request.
export function androidTrimIntent(trimMode, seconds) {
  const intent = safeNativeSaveData({ trimMode, requestedTrimMs: Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined });
  intent.trimMode ||= 'unknown';
  if ((intent.trimMode === 'brief' && seconds !== 30)
    || (intent.trimMode === 'standard' && seconds !== 90)
    || (intent.trimMode === 'full' && seconds != null && seconds !== 0)) {
    throw Object.assign(new Error('The selected trim duration is invalid. The original recording is unchanged.'), {
      code: 'recording_trim_invalid', data: { ...intent, stage: 'trimIntent' },
    });
  }
  if (seconds == null) intent.requestedTrimMs = 0;
  return intent;
}
export const needsRecordingExport = (seconds, { forDeviceSave = false, mediaType = '' } = {}) => {
  const mimeType = baseMediaMime(mediaType);
  return seconds > 0 || Capacitor.getPlatform() === 'ios'
    || (Capacitor.getPlatform() === 'android' && forDeviceSave
      && (mimeType.startsWith('video/') || mimeType === 'audio/webm'));
};

export function prepareRecording(blob, seconds = null, signal, { forDeviceSave = false, trimMode = 'unknown' } = {}) {
  if (!blob?.size) return Promise.reject(new Error('The recording is empty.'));
  const android = Capacitor.getPlatform() === 'android';
  let intent;
  try {
    if (android) intent = androidTrimIntent(trimMode, seconds);
    if (android && preparedBlobs.has(blob) && trimMode !== 'unknown') {
      const previous = preparedTrimIntents.get(blob);
      if (previous?.trimMode !== intent.trimMode || previous?.requestedTrimMs !== intent.requestedTrimMs) {
        throw Object.assign(new Error('The selected trim duration is invalid. The original recording is unchanged.'), { code: 'recording_trim_invalid', data: { ...intent, stage: 'trimIntent' } });
      }
      return Promise.resolve(blob); // Already trimmed: never apply the request twice.
    }
  } catch (error) {
    rememberAndroidSaveFailure(blob, error, 'trimIntent');
    return Promise.reject(error);
  }
  if ((!seconds && preparedBlobs.has(blob)) || !needsRecordingExport(seconds, { forDeviceSave, mediaType: blob.type })) return Promise.resolve(blob);
  let exports = exportsBySource.get(blob);
  if (!exports) { exports = new Map(); exportsBySource.set(blob, exports); }
  const key = android ? `${intent.trimMode}:${seconds > 0 ? seconds : 'full'}` : seconds > 0 ? seconds : 'full';
  if (!exports.has(key)) {
    rememberAndroidSaveMetrics(blob, intent || { requestedTrimMs: seconds > 0 ? seconds * 1000 : 0 });
    // Android must never fall back to WebView decode/re-record after a native
    // failure. Keep the source blob and evict failures so retry uses it again.
    const work = ['ios', 'android'].includes(Capacitor.getPlatform())
      ? exportNativeRecording(blob, seconds, intent)
      : exportBrowserRecording(blob, seconds, signal);
    const pending = work.then((result) => { preparedBlobs.add(result); if (android) preparedTrimIntents.set(result, intent); return result; }).catch((error) => {
      rememberAndroidSaveFailure(blob, error, 'preparation', seconds);
      exports.delete(key); throw error;
    });
    exports.set(key, pending);
  }
  return exports.get(key);
}