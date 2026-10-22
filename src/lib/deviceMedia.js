import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export const deviceMedia = registerPlugin('AgesSaveToDevice');

export function mediaExtension(blob, fallback = 'webm') {
  const type = (blob?.type || '').split(';')[0];
  return ({ 'video/mp4': 'mp4', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[type] || fallback;
}

export async function writeMediaTempFile(blob) {
  if (!blob?.size) throw new Error('The recording is empty.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('The recording could not be read.'));
    reader.readAsDataURL(blob);
  });
  const path = `ages_media_${crypto.randomUUID()}.${mediaExtension(blob)}`;
  // Omit encoding: Capacitor decodes base64 to bytes only on its binary path.
  const { uri } = await Filesystem.writeFile({ data, path, directory: Directory.Cache });
  const stat = await Filesystem.stat({ path: uri });
  if (stat.size !== blob.size) {
    await removeMediaTempFile(uri);
    throw new Error('The device copy did not match the recording. Nothing was saved.');
  }
  return uri;
}

export async function removeMediaTempFile(uri) {
  if (uri) await Filesystem.deleteFile({ path: uri });
}

export function assertPreparedVideoType(mimeType) {
  if (Capacitor.getPlatform() === 'ios' && mimeType?.split(';')[0] !== 'video/mp4') {
    throw Object.assign(new Error('The device did not produce an MP4 video. Retry preparation or recover the original recording below.'), { code: 'recording_format_invalid' });
  }
}

// The finished file is read back through the filesystem plugin, which returns its
// bytes directly. Never with fetch() on a converted file URL: iOS serves a media
// file to the page with a non-HTTP response (so a <video> can stream it instead of
// downloading it whole), and fetch() reports a non-HTTP response as not-ok — so a
// fetch here fails for exactly the .mp4/.m4a files this export produces.
function base64ToBytes(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function exportNativeRecording(blob, trimSeconds) {
  const input = await writeMediaTempFile(blob);
  let output;
  try {
    const result = await deviceMedia.prepareMedia({ filePath: input, mediaType: blob.type.startsWith('audio') ? 'audio' : 'video', trimSeconds });
    output = result.filePath;
    if (!blob.type.startsWith('audio')) assertPreparedVideoType(result.mimeType);
    const { data } = await Filesystem.readFile({ path: output });
    const bytes = base64ToBytes(data);
    if (!bytes.length) throw new Error('The prepared recording is empty.');
    return new Blob([bytes], { type: result.mimeType });
  } finally {
    await Promise.all([input, output].filter(Boolean).map((uri) => removeMediaTempFile(uri).catch(() => {})));
  }
}