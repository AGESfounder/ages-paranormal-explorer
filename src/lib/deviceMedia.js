import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export const deviceMedia = registerPlugin('AgesSaveToDevice');

export function mediaExtension(blob) {
  const type = (blob?.type || '').split(';')[0];
  return ({ 'video/mp4': 'mp4', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[type] || 'webm';
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

export async function exportNativeRecording(blob, trimSeconds) {
  const input = await writeMediaTempFile(blob);
  let output;
  try {
    const result = await deviceMedia.prepareMedia({ filePath: input, mediaType: blob.type.startsWith('audio') ? 'audio' : 'video', trimSeconds });
    output = result.filePath;
    const response = await fetch(Capacitor.convertFileSrc(output));
    if (!response.ok) throw new Error('The prepared recording could not be opened.');
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) throw new Error('The prepared recording is empty.');
    return new Blob([bytes], { type: result.mimeType });
  } finally {
    await Promise.all([input, output].filter(Boolean).map((uri) => removeMediaTempFile(uri).catch(() => {})));
  }
}