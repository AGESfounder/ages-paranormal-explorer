import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { rememberAndroidSaveMetrics, safeNativeSaveData } from '@/lib/androidSaveDiagnostics';

export const deviceMedia = registerPlugin('AgesSaveToDevice');

export const baseMediaMime = (mimeType = '') => mimeType.split(';')[0].trim().toLowerCase();

export function mediaExtension(blob, fallback = 'webm') {
  const type = baseMediaMime(blob?.type);
  return ({ 'video/mp4': 'mp4', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[type] || fallback;
}

async function readMediaBase64(blob) {
  if (!blob?.size) throw new Error('The recording is empty.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('The recording could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export async function writeMediaTempFile(blob) {
  const data = await readMediaBase64(blob);
  const path = `ages_media_${crypto.randomUUID()}.${mediaExtension(blob)}`;
  // Omit encoding: Capacitor decodes base64 to bytes only on its binary path.
  const { uri } = await Filesystem.writeFile({ data, path, directory: Directory.Cache });
  const stat = await Filesystem.stat({ path: uri });
  if (stat.size !== blob.size) {
    const error = new Error('The device copy did not match the recording. Nothing was saved.');
    if (Capacitor.getPlatform() === 'android' && Number.isSafeInteger(stat.size) && stat.size >= 0) {
      Object.assign(error, { data: { stagedBytes: stat.size, stagedByteDelta: stat.size - blob.size } });
    }
    await removeMediaTempFile(uri).catch(() => {});
    throw error;
  }
  return uri;
}

async function stageAndroidRecordingInput(blob) {
  const data = await readMediaBase64(blob);
  const result = await deviceMedia.stageRecordingInput({ data, expectedBytes: blob.size, extension: mediaExtension(blob) });
  const uri = result?.filePath;
  try {
    if (typeof uri !== 'string' || !uri.startsWith('file://')) throw new Error('The recording could not be read.');
    // Independently verify the closed native file as well as the native byte count.
    const stat = await Filesystem.stat({ path: uri });
    if (result.stagedBytes !== blob.size || stat.size !== blob.size) {
      const error = new Error('The device copy did not match the recording. Nothing was saved.');
      const stagedBytes = stat.size !== blob.size ? stat.size : result.stagedBytes;
      if (Number.isSafeInteger(stagedBytes) && stagedBytes >= 0) {
        Object.assign(error, { data: { stagedBytes, stagedByteDelta: stagedBytes - blob.size } });
      }
      throw error;
    }
    return uri;
  } catch (error) {
    await removeMediaTempFile(uri).catch(() => {});
    throw error;
  }
}

export async function removeMediaTempFile(uri) {
  if (uri) await Filesystem.deleteFile({ path: uri });
}

export function assertPreparedVideoType(mimeType) {
  if ((Capacitor.getPlatform() === 'ios' && mimeType?.split(';')[0] !== 'video/mp4')
    || (Capacitor.getPlatform() === 'android' && baseMediaMime(mimeType) !== 'video/mp4')) {
    const guidance = Capacitor.getPlatform() === 'ios'
      ? 'Retry preparation or recover the original recording below.'
      : 'Your original recording is still available. Retry preparation.';
    throw Object.assign(new Error(`The device did not produce an MP4 video. ${guidance}`), { code: 'recording_format_invalid' });
  }
}

export function assertPreparedAudioType(mimeType) {
  if (Capacitor.getPlatform() === 'android' && baseMediaMime(mimeType) !== 'audio/mp4') {
    throw Object.assign(new Error('The device did not produce AAC/M4A audio. Your original recording is still available. Retry preparation.'), { code: 'recording_format_invalid' });
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

export async function exportNativeRecording(blob, trimSeconds, intent) {
  const mimeType = baseMediaMime(blob.type);
  if (!mimeType.startsWith('audio/') && !mimeType.startsWith('video/')) {
    throw Object.assign(new Error('The recording format could not be identified. Your original is still available.'), { code: 'recording_format_invalid' });
  }
  const audioOnly = mimeType.startsWith('audio/');
  let input;
  let output;
  let diagnostics = safeNativeSaveData(intent);
  let stage = 'inputStaging';
  try {
    input = Capacitor.getPlatform() === 'android'
      ? await stageAndroidRecordingInput(blob)
      : await writeMediaTempFile(blob);
    stage = 'inspection';
    const result = Capacitor.getPlatform() === 'android'
      ? await deviceMedia.prepareMedia({ filePath: input, mediaType: audioOnly ? 'audio' : 'video', trimSeconds, trimMode: diagnostics.trimMode })
      : await deviceMedia.prepareMedia({ filePath: input, mediaType: audioOnly ? 'audio' : 'video', trimSeconds });
    diagnostics = { ...diagnostics, ...safeNativeSaveData(result.diagnostics) };
    rememberAndroidSaveMetrics(blob, diagnostics);
    output = result.filePath;
    if (Capacitor.getPlatform() === 'android' && (typeof output !== 'string' || !output || output === input)) {
      throw Object.assign(new Error('The device did not return a prepared recording. Your original is still available. Retry preparation.'), { code: 'recording_export_failed' });
    }
    if (audioOnly) assertPreparedAudioType(result.mimeType);
    else assertPreparedVideoType(result.mimeType);
    stage = 'outputRead';
    const { data } = await Filesystem.readFile({ path: output });
    const bytes = base64ToBytes(data);
    if (!bytes.length) throw new Error('The prepared recording is empty.');
    const prepared = new Blob([bytes], { type: result.mimeType });
    rememberAndroidSaveMetrics(prepared, diagnostics);
    return prepared;
  } catch (error) {
    if (Capacitor.getPlatform() === 'android') error.data = { ...diagnostics, stage, ...safeNativeSaveData(error.data) };
    throw error;
  } finally {
    await Promise.all([...new Set([input, output].filter(Boolean))].map((uri) => removeMediaTempFile(uri).catch(() => {})));
  }
}