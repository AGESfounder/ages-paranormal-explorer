import { Capacitor } from '@capacitor/core';
import { deviceMedia, mediaExtension, writeMediaTempFile, removeMediaTempFile } from '@/lib/deviceMedia';
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
  const prepared = blob.type.startsWith('image') ? blob : await prepareRecording(blob);
  const displayName = filename.replace(/\.[^.]+$/, `.${mediaExtension(prepared)}`);
  if (!Capacitor.isNativePlatform()) {
    webDownload(prepared, displayName);
    return { destination: 'downloads', note: 'Download started. Check your browser downloads.' };
  }
  const uri = await writeMediaTempFile(prepared);
  try {
    const mediaType = prepared.type.startsWith('audio') ? 'audio' : prepared.type.startsWith('image') ? 'image' : 'video';
    const result = await deviceMedia.saveMedia({ filePath: uri, mediaType, displayName, prepared: true });
    if (!result?.success) throw new Error('The device did not confirm the save.');
    return { ...result, destination: result.destination || (mediaType === 'audio' ? 'files' : 'gallery') };
  } finally {
    await removeMediaTempFile(uri).catch(() => {});
  }
}

export function buildDeviceFilename(prefix, blob) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}_${stamp}.${mediaExtension(blob)}`;
}