import { Capacitor } from '@capacitor/core';
import { deviceMedia, baseMediaMime, mediaExtension, writeMediaTempFile, removeMediaTempFile, assertPreparedVideoType } from '@/lib/deviceMedia';
import { prepareRecording } from '@/lib/prepareRecording';

// Device-local only. Native errors are shown to the user, never hidden behind
// a browser download that iOS may not actually save.
function webDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function saveBlobToDevice(blob, filename) {
  if (!blob?.size) throw new Error('There is no recording to save.');
  let prepared;
  // Only preparation failures expose original recovery. Permission, staging and
  // Photos write failures must remain save errors, not conversion failures.
  try {
    // Android video and WebM audio require real native conversion before staging.
    // Journal uploads, browser export and iOS original-to-Files keep their paths.
    prepared = baseMediaMime(blob.type).startsWith('image/') ? blob : await prepareRecording(blob, null, undefined, { forDeviceSave: true });
    const preparedMime = baseMediaMime(prepared.type);
    if (!preparedMime.startsWith('audio/') && !preparedMime.startsWith('image/')) assertPreparedVideoType(prepared.type);
    if (Capacitor.getPlatform() === 'android' && preparedMime === 'audio/webm') {
      throw new Error('Android did not convert the WebM audio to AAC/M4A. Your original is still available. Retry preparation.');
    }
  } catch (cause) {
    if (Capacitor.getPlatform() === 'ios' && !['recording_export_failed', 'recording_format_invalid'].includes(cause.code)) throw cause;
    const guidance = Capacitor.getPlatform() === 'android'
      ? 'The recording could not be prepared. Your original is still available. Try Save to Device again.'
      : 'The recording could not be prepared. Retry or recover the original.';
    throw Object.assign(new Error(cause.message || guidance), { code: 'recording_preparation_failed' });
  }
  const displayName = filename.replace(/\.[^.]+$/, `.${mediaExtension(prepared)}`);
  if (!Capacitor.isNativePlatform()) {
    webDownload(prepared, displayName);
    return { destination: 'downloads', note: 'Download started. Check your browser downloads.' };
  }
  const uri = await writeMediaTempFile(prepared);
  try {
    const preparedMime = baseMediaMime(prepared.type);
    const mediaType = preparedMime.startsWith('audio/') ? 'audio' : preparedMime.startsWith('image/') ? 'image' : 'video';
    const result = await deviceMedia.saveMedia({ filePath: uri, mediaType, displayName, prepared: true });
    if (!result?.success) throw new Error('The device did not confirm the save.');
    return { ...result, destination: result.destination || (mediaType === 'audio' ? 'files' : 'gallery') };
  } finally {
    await removeMediaTempFile(uri).catch(() => {});
  }
}

// Explicit recovery of the untouched, full recording — never mark it prepared.
// Native audio copies directly to Files/Documents without conversion (also used
// by Audio Recorder's iOS save). Only video retries conversion, then falls back
// to Documents. Report the actual destination, not an assumed Photos success.
export async function recoverOriginalToDevice(originalBlob, filename) {
  if (Capacitor.getPlatform() !== 'ios') throw new Error('Original recovery is available on iOS only.');
  if (!originalBlob?.size) throw new Error('There is no original recording to recover.');
  const uri = await writeMediaTempFile(originalBlob);
  try {
    const result = await deviceMedia.saveMedia({ filePath: uri, mediaType: originalBlob.type.startsWith('audio') ? 'audio' : 'video', displayName: filename, prepared: false });
    if (!result?.success) throw new Error('The device did not confirm the recovery. Try again.');
    if (!['photos', 'files'].includes(result.destination)) throw new Error('The device did not confirm where the recording was saved.');
    return result;
  } finally {
    await removeMediaTempFile(uri).catch(() => {});
  }
}

export function buildDeviceFilename(prefix, blob, fallbackExtension = 'webm') {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}_${stamp}.${mediaExtension(blob, fallbackExtension)}`;
}