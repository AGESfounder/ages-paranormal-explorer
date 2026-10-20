import { Capacitor } from '@capacitor/core';
import { exportNativeRecording } from '@/lib/deviceMedia';
import { exportBrowserRecording } from '@/lib/browserRecordingExport';

const exportsBySource = new WeakMap();
const preparedBlobs = new WeakSet();
export const needsRecordingExport = (seconds) => seconds > 0 || Capacitor.getPlatform() === 'ios';

export function prepareRecording(blob, seconds = null, signal) {
  if (!blob?.size) return Promise.reject(new Error('The recording is empty.'));
  if ((!seconds && preparedBlobs.has(blob)) || !needsRecordingExport(seconds)) return Promise.resolve(blob);
  let exports = exportsBySource.get(blob);
  if (!exports) { exports = new Map(); exportsBySource.set(blob, exports); }
  const key = seconds > 0 ? seconds : 'full';
  if (!exports.has(key)) {
    const work = Capacitor.getPlatform() === 'ios'
      ? exportNativeRecording(blob, seconds)
      : exportBrowserRecording(blob, seconds, signal);
    const pending = work.then((result) => { preparedBlobs.add(result); return result; }).catch((error) => { exports.delete(key); throw error; });
    exports.set(key, pending);
  }
  return exports.get(key);
}