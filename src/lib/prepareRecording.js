import { Capacitor } from '@capacitor/core';
import { exportNativeRecording } from '@/lib/deviceMedia';
import { exportBrowserRecording } from '@/lib/browserRecordingExport';

const exportsBySource = new WeakMap();
const preparedBlobs = new WeakSet();
export const needsRecordingExport = (seconds, { forDeviceSave = false, mediaType = '' } = {}) => (
  seconds > 0 || Capacitor.getPlatform() === 'ios'
  || (Capacitor.getPlatform() === 'android' && forDeviceSave && mediaType.startsWith('video'))
);

export function prepareRecording(blob, seconds = null, signal, { forDeviceSave = false } = {}) {
  if (!blob?.size) return Promise.reject(new Error('The recording is empty.'));
  if ((!seconds && preparedBlobs.has(blob)) || !needsRecordingExport(seconds, { forDeviceSave, mediaType: blob.type })) return Promise.resolve(blob);
  let exports = exportsBySource.get(blob);
  if (!exports) { exports = new Map(); exportsBySource.set(blob, exports); }
  const key = seconds > 0 ? seconds : 'full';
  if (!exports.has(key)) {
    // Android must never fall back to WebView decode/re-record after a native
    // failure. Keep the source blob and evict failures so retry uses it again.
    const work = ['ios', 'android'].includes(Capacitor.getPlatform())
      ? exportNativeRecording(blob, seconds)
      : exportBrowserRecording(blob, seconds, signal);
    const pending = work.then((result) => { preparedBlobs.add(result); return result; }).catch((error) => { exports.delete(key); throw error; });
    exports.set(key, pending);
  }
  return exports.get(key);
}