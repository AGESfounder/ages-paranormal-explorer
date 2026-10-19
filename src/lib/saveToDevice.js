import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Local save of a recording Blob — no network, no upload. Used by the
// "Save to Device" evidence option so recordings can be kept during field
// investigations with poor or no cell service, then uploaded to the Journal
// later once back in range.
//
// On native (iOS/Android) the blob is written to a cache temp file, then handed
// to a native plugin that saves it to the Photo Library (iOS) or MediaStore
// (Android) — so the user can find it in their Photos/Gallery app. On web (or
// if the native save fails, or for audio which the Photo Library can't hold)
// it falls back to a standard browser download.
const AgesSaveToDevice = registerPlugin('AgesSaveToDevice');

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result.split(',')[1] : '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
  if (!blob) return;

  if (Capacitor.isNativePlatform()) {
    const isAudio = blob.type.startsWith('audio');
    const isImage = blob.type.startsWith('image');
    const mediaType = isAudio ? 'audio' : (isImage ? 'image' : 'video');

    try {
      const ext = filename.split('.').pop() || (isAudio ? 'm4a' : 'mp4');
      const tempPath = `ages_temp_${Date.now()}.${ext}`;
      const base64 = await blobToBase64(blob);
      // encoding: 'base64' is required — without it Capacitor writes the base64
      // string as UTF-8 text, so the file on disk is the text, not the binary
      // audio/video, and the native save hands a text file to Photos/Documents.
      await Filesystem.writeFile({
        data: base64,
        path: tempPath,
        directory: Directory.Cache,
        encoding: 'base64',
      });
      const { uri } = await Filesystem.getUri({ path: tempPath, directory: Directory.Cache });
      await AgesSaveToDevice.saveMedia({ filePath: uri, mediaType, displayName: filename });
      try { await Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache }); } catch {}
      return;
    } catch (e) {
      console.warn('Native save failed, falling back to download:', e);
    }
  }

  webDownload(blob, filename);
}

export function buildDeviceFilename(prefix, blob) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  let ext = 'webm';
  if (blob?.type?.includes('mp4')) ext = 'mp4';
  else if (blob?.type?.includes('audio')) ext = 'webm';
  return `${prefix}_${stamp}.${ext}`;
}