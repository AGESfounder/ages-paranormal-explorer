#!/usr/bin/env node
// Dependency-free, read-only Android source gate. No Gradle, processes, or writes.
// This verifies source contracts, not Android compilation or device behavior.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (label, ok) => results.push({ label, ok: Boolean(ok) });
const read = (path) => {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    check(`Required source exists: ${path}`, false);
    return '';
  }
};
const java = (path) => read(path).replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (part) => part.startsWith('/') ? '' : part);
const nativePath = 'android/app/src/main/java/com/ages/explorer/';

const gradle = read('android/app/build.gradle');
for (const [key, value] of [['namespace', '"com.ages.explorer"'], ['applicationId', '"com.ages.explorer"'], ['versionCode', '28'], ['versionName', '"1.0"']]) {
  const values = [...gradle.matchAll(new RegExp(`^\\s*${key}\\s+([^\\r\\n]+)`, 'gm'))];
  check(`Android ${key} is exactly ${value}`, values.length === 1 && values[0][1].trim() === value);
}
const config = read('capacitor.config.ts');
check('Capacitor keeps com.ages.explorer and dist', /appId:\s*'com\.ages\.explorer'/.test(config) && /webDir:\s*'dist'/.test(config));
const variables = read('android/variables.gradle');
check('Android SDK bounds remain min 24 / compile 36 / target 36', /minSdkVersion\s*=\s*24\b/.test(variables) && /compileSdkVersion\s*=\s*36\b/.test(variables) && /targetSdkVersion\s*=\s*36\b/.test(variables));
check('Release signing remains configured', ['CM_KEYSTORE_PATH', 'CM_KEYSTORE_PASSWORD', 'CM_KEY_ALIAS', 'CM_KEY_PASSWORD', 'signingConfig signingConfigs.release'].every((value) => gradle.includes(value)));

const save = java(`${nativePath}AgesSaveToDevicePlugin.java`);
check('Save plugin retains package, class, and JS identity', /package com\.ages\.explorer;/.test(save) && /public class AgesSaveToDevicePlugin extends Plugin/.test(save) && /@CapacitorPlugin\(\s*name\s*=\s*"AgesSaveToDevice"/.test(save));
check('Save declares only the legacy write permission alias', /@Permission\(\s*alias\s*=\s*"legacyStorage",\s*strings\s*=\s*\{\s*Manifest\.permission\.WRITE_EXTERNAL_STORAGE\s*\}\s*\)/.test(save) && (save.match(/@Permission\(/g) ?? []).length === 1);
for (const name of ['PermissionState', 'annotation.Permission', 'annotation.PermissionCallback']) {
  check(`Save imports Capacitor ${name}`, save.includes(`import com.getcapacitor.${name};`));
}
// Deliberately anchored to the method entry: no save can precede the gate.
const gate = /@PluginMethod\s+public void saveMedia\(PluginCall call\)\s*\{\s*if\s*\(Build\.VERSION\.SDK_INT\s*<=\s*Build\.VERSION_CODES\.P\s*&&\s*getPermissionState\("legacyStorage"\)\s*!=\s*PermissionState\.GRANTED\)\s*\{\s*requestPermissionForAlias\("legacyStorage",\s*call,\s*"legacyStoragePermissionCallback"\);\s*return;\s*\}/;
check('Save requests permission only on API <= 28 and returns before writing', gate.test(save));
check('Save has only one runtime permission request site', (save.match(/requestPermission\w*\(/g) ?? []).length === 1);
check('Permission callback rejects denial and resumes save only after grant', /@PermissionCallback\s+private void legacyStoragePermissionCallback\(PluginCall call\)\s*\{\s*if\s*\(getPermissionState\("legacyStorage"\)\s*!=\s*PermissionState\.GRANTED\)\s*\{\s*call\.reject\("[^"\n]+"\);\s*return;\s*\}\s*saveMedia\(call\);\s*\}/.test(save));
check('Save preserves filePath/mediaType/displayName inputs and result', ['filePath', 'mediaType', 'displayName'].every((key) => save.includes(`call.getString("${key}")`)) && save.includes('result.put("success", true)') && save.includes('result.put("uri", uri.toString())') && save.includes('call.resolve(result)'));
check('Save retains modern scoped MediaStore insert/copy behavior', /if\s*\(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.Q\)\s*\{\s*values\.put\(MediaStore\.MediaColumns\.RELATIVE_PATH, subDir\);\s*values\.put\(MediaStore\.MediaColumns\.IS_PENDING, 1\);\s*\}/.test(save) && ['MediaStore.Images.Media.EXTERNAL_CONTENT_URI', 'MediaStore.Video.Media.EXTERNAL_CONTENT_URI', 'MediaStore.Audio.Media.EXTERNAL_CONTENT_URI', 'resolver.insert(collection, values)', 'resolver.openOutputStream(uri)', 'out.write(buf, 0, len)'].every((value) => save.includes(value)));
check('MediaStore publishes only after the copy closes, and deletes inserted rows on failure', save.includes('published.put(MediaStore.MediaColumns.IS_PENDING, 0)') && save.indexOf('resolver.update(uri, published, null, null)') > save.indexOf('out.write(buf, 0, len)') && save.includes('resolver.delete(uri, null, null)') && /if \(out == null\)\s*\{\s*throw new java\.io\.IOException/.test(save) && /if \(uri == null\)\s*\{\s*throw new java\.io\.IOException/.test(save));
check('Android audio returns its Music destination and API-aware location note', save.includes('result.put("destination", isAudio ? "music" : "gallery")') && save.includes('Saved to Music/AGES.') && save.includes("Saved to your device's Music collection."));
const saveJs = read('src/lib/saveToDevice.js');
const deviceMediaJs = read('src/lib/deviceMedia.js');
check('Shared JS Save seam registers AgesSaveToDevice and calls saveMedia', deviceMediaJs.includes("registerPlugin('AgesSaveToDevice')") && saveJs.includes("from '@/lib/deviceMedia'") && saveJs.includes('deviceMedia.saveMedia('));

// Recording preparation contracts only. Passing these source checks cannot
// establish codec support, output duration/seekability, or native compilation.
check('Android exposes prepareMedia as a Capacitor promise method', /@PluginMethod\s+public void prepareMedia\(PluginCall call\)/.test(save));
check('Android preparation accepts filePath, mediaType and trimSeconds', ['filePath', 'mediaType'].every((key) => save.includes(`call.getString("${key}")`)) && /call\.getDouble\("trimSeconds"(?:\s*,[^)]*)?\)/.test(save));
check('Android preparation returns output filePath and truthful MP4 MIME fields', /\.put\("filePath",/.test(save) && /\.put\("mimeType",/.test(save) && save.includes('"video/mp4"') && save.includes('"audio/mp4"'));
const media3Modules = ['media3-transformer', 'media3-common', 'media3-effect'];
const media3Versions = media3Modules.map((module) => [...gradle.matchAll(new RegExp(`implementation\\s+["']androidx\\.media3:${module}:([^"']+)["']`, 'g'))]);
check('Media3 transformer/common/effect each use one identical pinned stable version', media3Versions.every((matches) => matches.length === 1 && /^\d+\.\d+\.\d+$/.test(matches[0][1])) && new Set(media3Versions.map((matches) => matches[0]?.[1])).size === 1);
check('Android preparation uses Media3 Transformer with H.264/AAC output codecs', save.includes('import androidx.media3.transformer.Transformer;') && save.includes('setVideoMimeType(MimeTypes.VIDEO_H264)') && save.includes('setAudioMimeType(MimeTypes.AUDIO_AAC)'));
check('Android preparation has async completion/error and duration inspection', /void onCompleted\(/.test(save) && /void onError\(/.test(save) && save.includes('METADATA_KEY_DURATION') && save.includes('recording_export_failed'));

const preparationJs = read('src/lib/prepareRecording.js');
check('Android and iOS prepare natively while web retains its browser exporter', /const work = \['ios', 'android'\]\.includes\(Capacitor\.getPlatform\(\)\)\s*\? exportNativeRecording\(blob, seconds, intent\)\s*: exportBrowserRecording\(blob, seconds, signal\)/.test(preparationJs));
check('Trim, full Android video and WebM audio device saves require preparation by normalized MIME', preparationJs.includes("seconds > 0 || Capacitor.getPlatform() === 'ios'") && preparationJs.includes("Capacitor.getPlatform() === 'android' && forDeviceSave") && preparationJs.includes('const mimeType = baseMediaMime(mediaType)') && preparationJs.includes("mimeType.startsWith('video/') || mimeType === 'audio/webm'") && preparationJs.includes('needsRecordingExport(seconds, { forDeviceSave, mediaType: blob.type })'));
check('Full Android video preparation precedes native-save staging and MediaStore', saveJs.includes("Capacitor.getPlatform() === 'android' ? trimSeconds : null, undefined, { forDeviceSave: true, trimMode }") && saveJs.includes("trimSeconds = null") && saveJs.indexOf('await prepareRecording(') < saveJs.indexOf('await writeMediaTempFile(prepared)') && saveJs.indexOf('await writeMediaTempFile(prepared)') < saveJs.indexOf('await deviceMedia.saveMedia('));
check('JS uses normalized audio/video prepareMedia routing and reads output bytes', deviceMediaJs.includes("deviceMedia.prepareMedia({ filePath: input, mediaType: audioOnly ? 'audio' : 'video', trimSeconds })") && deviceMediaJs.includes('const mimeType = baseMediaMime(blob.type)') && deviceMediaJs.includes("const audioOnly = mimeType.startsWith('audio/')") && deviceMediaJs.includes('output = result.filePath') && deviceMediaJs.includes('Filesystem.readFile({ path: output })') && deviceMediaJs.includes('type: result.mimeType'));
check('Android rejects non-MP4 video and non-AAC/MP4 prepared audio', deviceMediaJs.includes("Capacitor.getPlatform() === 'android' && baseMediaMime(mimeType) !== 'video/mp4'") && deviceMediaJs.includes("Capacitor.getPlatform() === 'android' && baseMediaMime(mimeType) !== 'audio/mp4'") && deviceMediaJs.includes('assertPreparedVideoType(result.mimeType)') && deviceMediaJs.includes('assertPreparedAudioType(result.mimeType)') && deviceMediaJs.includes("'audio/mp4': 'm4a'") && saveJs.includes('mediaExtension(prepared)'));
check('Failed preparation is retryable and temporary copies are cleaned up', preparationJs.includes('exports.delete(key); throw error;') && deviceMediaJs.includes('finally') && deviceMediaJs.includes('removeMediaTempFile(uri).catch(() => {})'));

check('Full sources can reach transformation without strict duration evidence; trims retain it', save.includes('inspectMedia(source, "source", requestedTrimMs > 0)') && /if \(requireExactDuration\)\s*\{\s*scanTimelines\(extractor, tracks\)/.test(save) && save.includes('durationMs = resolveDurationMs(containerDurationMs, tracks, stage)') && save.includes('durationMs = Math.max(0L, containerDurationMs)'));
check('All outputs require positive duration and expected tracks, with exact measured-duration checks only for trims', save.includes('inspectMedia(output, "output", trimRequested)') && save.includes('if (outputInfo.durationMs <= 0)') && /long measuredDurationMs = outputInfo\.declaredDurationMs > 0\s*\? outputInfo\.declaredDurationMs\s*: outputInfo\.durationMs;/.test(save) && save.includes('if (trimRequested && Math.abs(measuredDurationMs - expectedDurationMs) > DURATION_TOLERANCE_MS)') && save.includes('DURATION_TOLERANCE_MS = 750L') && save.includes('!outputInfo.hasAudio || outputInfo.hasVideo || !outputInfo.hasAacAudio') && save.includes('!outputInfo.hasVideo || !outputInfo.hasH264Video') && save.includes('sourceHadAudio && (!outputInfo.hasAudio || !outputInfo.hasAacAudio)'));
// Scope this contract to the real inspection/resolver methods. Container metadata
// is advisory; trims require a measurable sample span, not matching headers.
const inspection = save.split('private MediaInfo inspectMedia(')[1]?.split('private long readMetadataDurationMs(')[0] ?? '';
const durationResolver = save.split('private long resolveDurationMs(')[1]?.split('private MediaPreparationException durationEvidenceError(')[0] ?? '';
const sampleScan = save.split('private void scanTimelines(')[1]?.split('private long resolveDurationMs(')[0] ?? '';
check('Full exports require readable tracks; trims require bounded sample-backed duration with advisory metadata',
  save.includes('inspectMedia(source, "source", requestedTrimMs > 0)')
  && /if \(!hasAudio && !hasVideo\)\s*\{\s*throw new MediaPreparationException\(/.test(inspection)
  && /durationMs = Math\.max\(0L, containerDurationMs\);\s*if \(requireExactDuration\)\s*\{\s*scanTimelines\(extractor, tracks\);/.test(inspection)
  && (inspection.match(/scanTimelines\(/g) ?? []).length === 1
  && inspection.includes('durationMs = resolveDurationMs(containerDurationMs, tracks, stage)')
  && /if \(\+\+sampleCount > MAX_DURATION_SCAN_SAMPLES\)\s*\{\s*throw new MediaPreparationException\(/.test(sampleScan)
  && sampleScan.includes('track.addSample(extractor.getSampleTime())')
  && /if \(track.sampleCount < 2 \|\| track.lastPtsUs <= track.firstPtsUs\)\s*\{[^}]*continue;\s*\}/.test(durationResolver)
  && durationResolver.includes('long timelineMs = track.lastPtsUs / 1000L;')
  && /if \(declaredMs > 0 && Math.abs\(declaredMs - timelineMs\) <= DURATION_TOLERANCE_MS\)\s*\{\s*supportedMs = declaredMs;\s*\} else \{[\s\S]*?supportedMs = timelineMs;\s*\}/.test(durationResolver)
  && durationResolver.includes('resolvedMs = Math.max(resolvedMs, supportedMs)')
  && durationResolver.includes('if (resolvedMs <= 0) throw durationEvidenceError();')
  && !/supportedMs = containerMs|resolvedMs = containerMs/.test(durationResolver)
  && save.includes('inspectMedia(output, "output", trimRequested)')
  && /if \(outputInfo.durationMs <= 0\)\s*\{\s*throw new MediaPreparationException\(/.test(save)
  && save.includes('if (trimRequested && Math.abs(measuredDurationMs - expectedDurationMs) > DURATION_TOLERANCE_MS)'));
const recordingLabel = read('src/lib/recordingLabel.js');
const structuredMimeResolution = recordingLabel.includes("import { Capacitor } from '@capacitor/core';")
  && /export function isAndroidRecording\(\) \{\s*try \{\s*return Capacitor\.getPlatform\(\) === 'android';\s*\} catch \{\s*return false;\s*\}\s*\}/.test(recordingLabel)
  && /export function recordingBlobType\(\{ recorderMime, chunkMime, requestedMime, fallback \}\) \{\s*const reported = recorderMime \|\| chunkMime \|\| requestedMime \|\| fallback \|\| '';\s*if \(!isAndroidRecording\(\)\) return reported;\s*return String\(reported\)\.split\(';'\)\[0\]\.trim\(\) \|\| fallback;\s*\}/.test(recordingLabel);
const structuredMimeAssemblies = {
  'src/components/PhoneREMDevice.jsx': /const actualMime = recordingBlobType\(\{\s*recorderMime: mr\.mimeType,\s*chunkMime: videoChunksRef\.current\.find\(\(c\) => c\.blob\.type\)\?\.blob\.type,\s*requestedMime: mimeType,\s*fallback: canvasCapture \? 'video\/webm' : 'audio\/webm',\s*\}\);\s*const blob = new Blob\(videoChunksRef\.current\.map\(\(c\) => c\.blob\), \{ type: actualMime \}\);/,
  'src/components/AcousticAnomalySweeper.jsx': /const actualMime = recordingBlobType\(\{\s*recorderMime: mr\.mimeType,\s*chunkMime: chunksRef\.current\.find\(\(c\) => c\.blob\.type\)\?\.blob\.type,\s*requestedMime: mimeRef\.current,\s*fallback: audioOnlyRef\.current \? 'audio\/webm' : 'video\/webm',\s*\}\);\s*const blob = new Blob\(chunksRef\.current\.map\(\(c\) => c\.blob\), \{ type: actualMime \}\);/,
  'src/hooks/useSweeperRecorder.js': /const blobType = recordingBlobType\(\{\s*recorderMime: mr\?\.mimeType,\s*chunkMime: videoChunksRef\.current\.find\(\(c\) => c\.blob\.type\)\?\.blob\.type,\s*requestedMime: mimeTypeRef\.current,\s*fallback: audioOnlyRef\.current \? 'audio\/webm' : 'video\/webm',\s*\}\);\s*const blob = new Blob\(videoChunksRef\.current\.map\(\(c\) => c\.blob\), \{ type: blobType \}\);/,
};
for (const path of ['src/components/PhoneREMDevice.jsx', 'src/components/AcousticAnomalySweeper.jsx', 'src/hooks/useSweeperRecorder.js', 'src/components/SiegConsole.jsx']) {
  const recorder = read(path);
  check(`${path} prefers actual recorder/chunk MIME without guessing MP4 audio`, path === 'src/components/SiegConsole.jsx'
    ? /mr\.mimeType \|\| [^\n]+find\(\(c\) => c\.blob\.type\)\?\.blob\.type/.test(recorder) && recorder.includes("'audio/webm' : 'video/webm'") || (recorder.includes("mr.mimeType || ") && recorder.includes('find((c) => c.blob.type)?.blob.type') && /(?:canvasCapture|picture) \? 'video\/webm' : 'audio\/webm'/.test(recorder))
    : structuredMimeResolution
      && /import \{ (?:isAndroidRecording, )?recordingBlobType \} from '@\/lib\/recordingLabel';/.test(recorder)
      && structuredMimeAssemblies[path].test(recorder));
}
const diagnostics = read('src/lib/androidSaveDiagnostics.js');
const saveButtons = read('src/components/EvidenceSaveButtons.jsx');
const yesNo = read('src/components/YesNoSweeper.jsx');
const trimOptions = read('src/lib/recordTrim.js');
const trimPicker = read('src/components/RecordTrimPicker.jsx');
const preparedHook = read('src/hooks/usePreparedRecording.js');
check('Y/K/IDK picker carries explicit Brief mode and 30 seconds through preparation and saving',
  /id: 'brief', label: 'Brief', seconds: 30\b/.test(trimOptions)
  && trimPicker.includes('onClick={() => onChange(opt.id)}')
  && yesNo.includes('TRIM_OPTIONS.find((o) => o.id === trimMode)?.seconds')
  && yesNo.includes('usePreparedRecording(videoBlob, trimSeconds, trimMode)')
  && yesNo.includes('trimMode={trimMode} trimSeconds={trimSeconds}')
  && preparedHook.includes('{ trimMode: androidTrimMode }')
  && saveButtons.includes('saveBlobToDevice(deviceBlob, filename, { trimMode, trimSeconds })')
  && deviceMediaJs.includes('trimSeconds, trimMode: diagnostics.trimMode')
  && save.includes('call.getString("trimMode")'));
check('Explicit Brief must equal 30000ms; invalid/missing intent fails without full fallback',
  preparationJs.includes("intent.trimMode === 'brief' && seconds !== 30")
  && preparationJs.includes("intent.trimMode === 'standard' && seconds !== 90")
  && preparationJs.includes('seconds * 1000')
  && preparationJs.includes("stage: 'trimIntent'")
  && save.includes('"brief".equals(trimMode) && (trimSeconds == null || trimSeconds != 30.0)')
  && save.includes('Math.round(trimSeconds * 1000.0)')
  && save.includes('diagnostics.put("stage", "trimIntent")'));
check('Prepared Brief is reused only for matching intent and never trimmed twice',
  preparationJs.includes('android && preparedBlobs.has(blob) && trimMode !== \'unknown\'')
  && preparationJs.includes('previous?.trimMode !== intent.trimMode || previous?.requestedTrimMs !== intent.requestedTrimMs')
  && preparationJs.includes('preparedTrimIntents.set(result, intent)')
  && preparationJs.indexOf('return Promise.resolve(blob); // Already trimmed') < preparationJs.indexOf('exportNativeRecording(blob, seconds, intent)')
  && preparationJs.includes('(!seconds && preparedBlobs.has(blob))'));
const nativeExport = deviceMediaJs.split('export async function exportNativeRecording(')[1] || '';
check('Input copy integrity failure is inputStaging before native inspection, with UI intent but no invented durations',
  nativeExport.includes('let diagnostics = safeNativeSaveData(intent)')
  && nativeExport.includes("let stage = 'inputStaging'")
  && /try \{\s*input = Capacitor.getPlatform\(\) === 'android'\s*\? await stageAndroidRecordingInput\(blob\)\s*: await writeMediaTempFile\(blob\);\s*stage = 'inspection';/.test(nativeExport)
  && nativeExport.indexOf('await stageAndroidRecordingInput(blob)') < nativeExport.indexOf('await deviceMedia.prepareMedia(')
  && nativeExport.includes('error.data = { ...diagnostics, stage, ...safeNativeSaveData(error.data) }')
  && deviceMediaJs.includes('Filesystem.writeFile({ data, path, directory: Directory.Cache })')
  && /if \(stat.size !== blob.size\) \{\s*const error = new Error\('The device copy did not match the recording. Nothing was saved.'\)/.test(deviceMediaJs)
  && /await removeMediaTempFile\(uri\)\.catch\(\(\) => \{\}\);\s*throw error;/.test(deviceMediaJs)
  && !/sourceDurationMs|outputDurationMs|comparisonDurationMs/.test(nativeExport));
const nativeInputStage = save.split('public void stageRecordingInput(PluginCall call) {')[1]?.split('@PluginMethod')[0] ?? '';
const jsInputStage = deviceMediaJs.split('async function stageAndroidRecordingInput(blob) {')[1]?.split('export async function removeMediaTempFile')[0] ?? '';
check('Android exposes dedicated input staging on a worker with a unique cache file and bounded base64 stream',
  /@PluginMethod\s+public void stageRecordingInput\(PluginCall call\)/.test(save)
  && nativeInputStage.includes('File.createTempFile("ages_input_", "." + extension, cacheDirectory)')
  && nativeInputStage.includes('new Base64InputStream(')
  && nativeInputStage.includes('new ByteArrayInputStream(data.getBytes(StandardCharsets.US_ASCII)), Base64.DEFAULT)')
  && nativeInputStage.includes('byte[] buffer = new byte[8192]')
  && /while \(\(count = input.read\(buffer\)\) != -1\)\s*\{\s*output.write\(buffer, 0, count\);\s*\}/.test(nativeInputStage)
  && nativeInputStage.includes('"ages-input-staging").start()'));
check('Native input streams flush and close before final length, equality gate, then resolve',
  /try \(InputStream input = new Base64InputStream\([\s\S]*?OutputStream output = new FileOutputStream\(staged\)\)\s*\{[\s\S]*?output.flush\(\);\s*\}\s*long stagedBytes = staged.length\(\);/.test(nativeInputStage)
  && nativeInputStage.indexOf('stagedBytes != sourceBytes') > nativeInputStage.indexOf('long stagedBytes = staged.length()')
  && nativeInputStage.indexOf('call.resolve(result)') > nativeInputStage.indexOf('stagedBytes != sourceBytes')
  && nativeInputStage.includes('result.put("filePath", Uri.fromFile(staged).toString())')
  && nativeInputStage.includes('result.put("stagedBytes", stagedBytes)'));
check('Native stage rejects invalid expected sizes and deletes failed/mismatched copies with safe diagnostics',
  nativeInputStage.includes('!Double.isFinite(expectedBytes) || expectedBytes <= 0')
  && nativeInputStage.includes('expectedBytes != Math.floor(expectedBytes)')
  && nativeInputStage.includes('saveDiagnostics("inputStaging")')
  && nativeInputStage.includes('diagnostics.put("stagedByteDelta", stagedBytes - sourceBytes)')
  && /if \(!staged.isFile\(\) \|\| stagedBytes != sourceBytes\)\s*\{\s*throw new MediaPreparationException\("The device copy did not match the recording. Nothing was saved."\);\s*\}/.test(nativeInputStage)
  && /catch \(Exception error\)\s*\{\s*if \(staged != null\) staged.delete\(\);/.test(nativeInputStage)
  && nativeInputStage.includes('call.reject(message, "recording_export_failed", diagnostics)')
  && !nativeInputStage.includes('prepareMedia('));
check('JS awaits native staging with original Blob size and independently stats the closed file',
  jsInputStage.includes('await deviceMedia.stageRecordingInput({ data, expectedBytes: blob.size, extension: mediaExtension(blob) })')
  && jsInputStage.indexOf('await Filesystem.stat({ path: uri })') > jsInputStage.indexOf('await deviceMedia.stageRecordingInput(')
  && jsInputStage.includes('result.stagedBytes !== blob.size || stat.size !== blob.size')
  && jsInputStage.indexOf('return uri;') > jsInputStage.indexOf('result.stagedBytes !== blob.size || stat.size !== blob.size')
  && /catch \(error\)\s*\{\s*await removeMediaTempFile\(uri\).catch\(\(\) => \{\}\);\s*throw error;/.test(jsInputStage)
  && !jsInputStage.includes('prepareMedia('));
check('Both native and JS byte mismatches reject partial files including seven bytes without a delay or fallback',
  nativeInputStage.includes('stagedBytes != sourceBytes')
  && jsInputStage.includes('result.stagedBytes !== blob.size || stat.size !== blob.size')
  && jsInputStage.includes('stagedByteDelta: stagedBytes - blob.size')
  && jsInputStage.includes("throw error;")
  && !/setTimeout|writeMediaTempFile|prepareMedia/.test(jsInputStage));
check('Generic iOS and prepared-output staging keep the existing Filesystem binary-write equality gate',
  deviceMediaJs.includes('const data = await readMediaBase64(blob)')
  && deviceMediaJs.includes('Filesystem.writeFile({ data, path, directory: Directory.Cache })')
  && deviceMediaJs.includes('stat.size !== blob.size')
  && nativeExport.includes(': await writeMediaTempFile(blob)')
  && saveJs.includes('uri = await writeMediaTempFile(prepared)'));
check('Hook retry changes attempt identity immediately, then prepares the retained source with unchanged trim intent',
  preparedHook.includes('retry: () => setAttempt((value) => value + 1)')
  && preparedHook.includes('result.attempt === attempt')
  && preparedHook.includes('setResult({ source, seconds, trimMode: androidTrimMode, attempt, blob: null, error: \'\' })')
  && preparedHook.includes('prepareRecording(source, seconds, controller.signal, { trimMode: androidTrimMode })')
  && preparedHook.includes('[source, seconds, androidTrimMode, needed, attempt]')
  && preparedHook.includes('originalBlob: source')
  && preparedHook.includes('if (!active) return')
  && preparedHook.includes("blob: null, error: error.message || 'The recording could not be prepared.'"));
const preparationUi = read('src/components/RecordingPreparation.jsx');
check('Visible hook Retry is an explicit non-submit button invoking the hook callback',
  preparationUi.includes('type="button" onClick={retry} disabled={!retry}')
  && preparationUi.includes('preparing ? <span')
  && preparationUi.includes('Preparing recording on this device'));
const deviceAttempt = saveButtons.split('const handleDevice = async')[1]?.split('const nativeLabel')[0] ?? '';
check('Save-time Android Retry explicitly uses the retained original and the current unchanged trim intent',
  saveButtons.includes('onClick={() => handleDevice(false, (isAndroid ? originalBlob : null) || deviceBlob)}')
  && deviceAttempt.includes('(recover = false, deviceBlob = deviceInput)')
  && deviceAttempt.includes('saveBlobToDevice(deviceBlob, filename, { trimMode, trimSeconds })')
  && saveButtons.includes('[deviceBlob, originalBlob, trimMode, trimSeconds]')
  && saveButtons.includes('originalBlob = null'));
check('Save-time Retry clears prior errors, shows progress, rejects a missing source and replaces the latest failure',
  deviceAttempt.indexOf("setSavePreparationError('')") < deviceAttempt.indexOf('await saveBlobToDevice(')
  && deviceAttempt.indexOf("setDeviceError('')") < deviceAttempt.indexOf('await saveBlobToDevice(')
  && deviceAttempt.includes('setDeviceSaving(true)')
  && deviceAttempt.includes('There is no recording available to prepare.')
  && deviceAttempt.includes("if (e.code === 'recording_preparation_failed') setSavePreparationError(e.message)")
  && deviceAttempt.includes("setDeviceError(e.message || 'Save failed. Please try again.')")
  && deviceAttempt.includes('setDeviceSaving(false)')
  && saveButtons.includes('deviceSaving && <p role="status"')
  && !/setOriginalBlob|setDeviceBlob|onSave\(/.test(deviceAttempt));
check('Retry diagnostics use the actual attempted source and Build 28 copy',
  deviceAttempt.includes('setDeviceAttemptBlob(input)')
  && saveButtons.includes('deviceError ? deviceAttemptBlob || deviceBlob : originalBlob')
  && saveButtons.includes('Build 28 tester report.'));
check('Brief, Standard and Full retain last-30s, last-90s and whole-source intent',
  /id: 'brief', label: 'Brief', seconds: 30, desc: 'last 30 seconds'/.test(trimOptions)
  && /id: 'standard', label: 'Standard', seconds: 90, desc: 'last 90 seconds'/.test(trimOptions)
  && /id: 'full', label: 'Full', seconds: null, desc: 'entire session'/.test(trimOptions)
  && preparationJs.includes('if (seconds == null) intent.requestedTrimMs = 0')
  && save.includes('"full".equals(trimMode) && requestedTrimMs != 0'));
check('Android copy mismatches report only safe staged byte counts and signed staged-minus-source delta',
  /if \(Capacitor.getPlatform\(\) === 'android' && Number.isSafeInteger\(stat.size\) && stat.size >= 0\) \{\s*Object.assign\(error, \{ data: \{ stagedBytes: stat.size, stagedByteDelta: stat.size - blob.size \} \}\);\s*\}/.test(deviceMediaJs)
  && diagnostics.includes("typeof data?.stagedByteDelta === 'number' && Number.isFinite(data.stagedByteDelta)")
  && diagnostics.includes('safe.stagedByteDelta = data.stagedByteDelta')
  && nativeExport.includes('...safeNativeSaveData(error.data)')
  && preparationJs.includes("rememberAndroidSaveFailure(blob, error, 'preparation', seconds)")
  && saveJs.includes('data: safeNativeSaveData(cause.data)'));
const allowedNumbers = ['androidApi', 'requestedTrimMs', 'requestedStartMs', 'requestedEndMs', 'expectedDurationMs', 'sourceDurationMs', 'outputDurationMs', 'comparisonDurationMs', 'durationToleranceMs', 'sourceBytes', 'outputBytes', 'stagedBytes', 'exportErrorCode'];
const actualNumbers = [...(diagnostics.match(/const numericKeys = \[([^\]]+)\]/)?.[1] || '').matchAll(/'([^']+)'/g)].map((match) => match[1]);
check('Diagnostics add only allowlisted trim enums, nonnegative metrics and finite signed delta',
  actualNumbers.length === allowedNumbers.length && actualNumbers.every((key) => allowedNumbers.includes(key))
  && diagnostics.includes("['brief', 'standard', 'full', 'unknown'].includes(data?.trimMode)")
  && diagnostics.includes("typeof data?.durationDifferenceMs === 'number' && Number.isFinite(data.durationDifferenceMs)")
  && diagnostics.includes('data[key] >= 0')
  && diagnostics.includes("'trimIntent', 'inputStaging', 'inspection'")
  && diagnostics.includes('publicMessages.has(message)'));
check('Native trim window and compared duration diagnostics retain the strict 750ms guard',
  save.includes('Math.min(requestedTrimMs, sourceInfo.durationMs)')
  && save.includes('long startMs = Math.max(0L, sourceInfo.durationMs - expectedDurationMs)')
  && save.includes('diagnostics.put("requestedStartMs", startMs)')
  && save.includes('diagnostics.put("requestedEndMs", sourceInfo.durationMs)')
  && save.includes('if (info.durationMs > 0) data.put(prefix + "DurationMs", info.durationMs)')
  && save.includes('if (expectedDurationMs > 0) diagnostics.put("expectedDurationMs", expectedDurationMs)')
  && save.includes('diagnostics.put("comparisonDurationMs", measuredDurationMs)')
  && save.includes('diagnostics.put("durationDifferenceMs", measuredDurationMs - expectedDurationMs)')
  && save.includes('diagnostics.put("durationToleranceMs", DURATION_TOLERANCE_MS)')
  && save.includes('DURATION_TOLERANCE_MS = 750L')
  && save.includes('if (trimRequested && Math.abs(measuredDurationMs - expectedDurationMs) > DURATION_TOLERANCE_MS)'));
check('Native failures return sanitized metrics and Media3 error code without raw exception messages', save.includes('call.reject(message, "recording_export_failed", diagnostics)') && save.includes('diagnostics.put("exportErrorCode", exception.errorCode)') && save.includes('result.put("androidApi", Build.VERSION.SDK_INT)') && !save.includes('call.reject("Failed to save to MediaStore: " + e.getMessage())'));
check('Preparation wrapper retains native code and allowlisted data', saveJs.includes('nativeCode: safeNativeSaveCode(cause.code), data: safeNativeSaveData(cause.data)') && saveJs.includes("code: 'recording_preparation_failed'") && deviceMediaJs.includes('...safeNativeSaveData(error.data)'));
check('Diagnostics are session-local and allowlist only safe primitive metrics/messages', diagnostics.includes('const reports = new WeakMap()') && diagnostics.includes('const numericKeys = [') && diagnostics.includes('const booleanKeys = [') && diagnostics.includes('Number.isFinite(data[key])') && diagnostics.includes('publicMessages.has(message)') && !/localStorage|sessionStorage|base44|fetch\(/.test(diagnostics));
check('Copy report includes real app/build, Android API, source MIME/size and trim evidence', diagnostics.includes('App.getInfo()') && diagnostics.includes('savePlugin.getSaveInfo()') && ['appVersion:', 'build:', 'androidApi:', 'sourceMime:', 'sourceBytes:', 'nativeErrorCode:', 'nativeErrorMessage:', 'stage:', 'requestedTrimMs'].every((field) => diagnostics.includes(field)) && preparationJs.includes("rememberAndroidSaveFailure(blob, error, 'preparation', seconds)"));
check('Copy diagnostics is Android-only beside save/preparation errors and preserves visible errors/retry', saveButtons.includes("const isAndroid = Capacitor.getPlatform() === 'android'") && saveButtons.includes('isAndroid && (deviceError || preparationError)') && saveButtons.includes('Copy save diagnostics') && saveButtons.includes('role="alert"') && saveButtons.includes("'Retry preparation'") && saveButtons.includes("music: 'Saved to Music'"));

const toolkit = read('src/pages/Toolkit.jsx');
const recorderSave = toolkit.split('const saveRecording = async (isPrivate = true) => {')[1]?.split('const fetchWeatherByCoords')[0] ?? '';
const saveCatch = recorderSave.split('} catch (err) {')[1] ?? '';
check('Audio Recorder keeps a separate persistent Journal-save alert by its controls', toolkit.includes("const [journalSaveError, setJournalSaveError] = useState('')") && /journalSaveError && \(\s*<div role="alert"/.test(toolkit) && toolkit.indexOf('{journalSaveError && (') < toolkit.indexOf('<EvidenceSaveButtons onSave={saveRecording}'));
check('Journal failure preserves recording/notes, shows retry guidance and releases saving state', saveCatch.includes('setJournalSaveError(') && saveCatch.includes('try the Journal save again') && !saveCatch.includes('setRecordedBlob(null)') && !saveCatch.includes("setRecorderNotes('')") && /finally\s*\{\s*setSavingRec\(false\)/.test(saveCatch) && recorderSave.indexOf('await base44.entities.Evidence.create(') < recorderSave.indexOf('setRecordedBlob(null)'));

const manifest = read('android/app/src/main/AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '');
const permissions = manifest.match(/<uses-permission\b[^>]*>/g) ?? [];
const writes = permissions.filter((tag) => /android:name="android\.permission\.WRITE_EXTERNAL_STORAGE"/.test(tag));
check('Manifest has one write permission capped at maxSdkVersion 28', writes.length === 1 && /android:maxSdkVersion="28"/.test(writes[0]));
check('Manifest and Save do not request broad read-media or all-files access', !/android\.permission\.(?:READ_EXTERNAL_STORAGE|READ_MEDIA_\w+|MANAGE_EXTERNAL_STORAGE|MANAGE_MEDIA)\b/.test(manifest) && !/(?:Manifest\.permission\.|android\.permission\.)(?:READ_EXTERNAL_STORAGE|READ_MEDIA_\w+|MANAGE_EXTERNAL_STORAGE|MANAGE_MEDIA)\b/.test(save));
check('MainActivity retains standard launch mode', /<activity\b[^>]*android:name="\.MainActivity"[^>]*android:launchMode="standard"/.test(manifest));
for (const permission of ['INTERNET', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'VIBRATE']) {
  check(`Manifest retains ${permission}`, permissions.some((tag) => tag.includes(`android:name="android.permission.${permission}"`)));
}
const main = java(`${nativePath}MainActivity.java`);
const onCreate = main.match(/public void onCreate\(Bundle savedInstanceState\)\s*\{([^}]+)\}/)?.[1] ?? '';
check('MainActivity retains app package and BridgeActivity', /package com\.ages\.explorer;/.test(main) && /class MainActivity extends BridgeActivity/.test(main));
for (const plugin of ['AgesSaveToDevicePlugin', 'AgesSettingsPlugin', 'AgesDepthPlugin', 'AgesSensorsPlugin']) {
  const registration = `registerPlugin(${plugin}.class);`;
  check(`${plugin} registered once before super.onCreate`, onCreate.split(registration).length === 2 && onCreate.indexOf(registration) < onCreate.indexOf('super.onCreate(savedInstanceState)'));
  check(`${plugin} source exists in app package`, java(`${nativePath}${plugin}.java`).includes('package com.ages.explorer;'));
}
const sensors = java(`${nativePath}AgesSensorsPlugin.java`);
check('Sensors load remains @Override public void load()', /@Override\s+public void load\(\)\s*\{/.test(sensors));

const depth = java(`${nativePath}AgesDepthPlugin.java`);
const depthGuard = /if\s*\(!session\.isDepthModeSupported\(Config\.DepthMode\.AUTOMATIC\)\)\s*\{\s*stopSession\(\);\s*call\.reject\("[^"\n]+",\s*"depth_unsupported"\);\s*return;\s*\}/;
const guardAt = depth.search(depthGuard);
const sessionAt = depth.indexOf('session = new Session(getActivity());');
const enableAt = depth.indexOf('config.setDepthMode(Config.DepthMode.AUTOMATIC);');
const configureAt = depth.indexOf('session.configure(config);');
const resumeAt = depth.indexOf('session.resume();');
check('Installed session checks AUTOMATIC support before enabling/configuring/resuming depth', sessionAt >= 0 && guardAt > sessionAt && enableAt > guardAt && configureAt > enableAt && resumeAt > configureAt);
check('Unsupported depth closes the session and rejects depth_unsupported before returning', depthGuard.test(depth) && /private void stopSession\(\)\s*\{\s*streaming = false;/.test(depth) && depth.includes('session.close();') && depth.includes('session = null;'));
check('ARCore and camera remain optional install features', /<meta-data\s+android:name="com.google.ar.core"\s+android:value="optional"/.test(manifest) && /<uses-feature\s+android:name="android.hardware.camera.ar"\s+android:required="false"/.test(manifest) && /<uses-feature\s+android:name="android.hardware.camera"\s+android:required="false"/.test(manifest));
const sls = read('src/components/SLSCamera.jsx');
check('Anomaly Camera keeps a persistent unsupported fallback and explicit depth routing', sls.includes('Choose Contrast Scan or Device Camera.') && sls.includes('{depthUnavailable && (') && sls.includes('setDepthAvailable(false)') && /if \(mode === 'depth'\)\s*\{[^}]+return;/s.test(sls));
check('Build 25 Anomaly Full video and Audio Recorder keep native MP4/M4A saves to Gallery/Music',
  sls.includes('usePreparedRecording(recordedBlob, trimSeconds)')
  && sls.includes('deviceBlob={displayBlob} originalBlob={preparedRecording.originalBlob}')
  && toolkit.includes('deviceBlob={recordedBlob} originalBlob={recordedBlob} iosAudioOriginalToFiles')
  && toolkit.includes("mimeType: 'audio/webm'")
  && preparationJs.includes("mimeType.startsWith('video/') || mimeType === 'audio/webm'")
  && save.includes('String extension = audioOnly ? "m4a" : "mp4"')
  && deviceMediaJs.includes("'audio/mp4': 'm4a'")
  && save.includes('Environment.DIRECTORY_MUSIC + "/AGES"')
  && save.includes('Environment.DIRECTORY_MOVIES + "/AGES"')
  && save.includes('result.put("destination", isAudio ? "music" : "gallery")'));

const pkg = JSON.parse(read('package.json') || '{}');
check('Both verifier scripts map to local read-only Node files', pkg.scripts?.['verify:android-native-plugins'] === 'node verify-android-native-plugins.mjs' && pkg.scripts?.['verify:native-plugins'] === 'node verify-ios-native-plugins.mjs');
const settings = read('android/capacitor.settings.gradle');
const pluginsGradle = read('android/app/capacitor.build.gradle');
for (const [dependency, project] of [['@revenuecat/purchases-capacitor', 'revenuecat-purchases-capacitor'], ['@capacitor-community/admob', 'capacitor-community-admob']]) {
  check(`${dependency} retains package and Android Gradle wiring`, Boolean(pkg.dependencies?.[dependency]) && settings.includes(`include ':${project}'`) && pluginsGradle.includes(`implementation project(':${project}')`));
}
const revenuecat = read('src/lib/revenuecat.js');
check('RevenueCat retains Android key, Google Play Trailblazer and purchase seams', ['VITE_REVENUECAT_ANDROID_API_KEY', "'trailblazer.30month'", "from '@revenuecat/purchases-capacitor'", 'Purchases.configure(', 'Purchases.purchaseStoreProduct(', 'Purchases.purchaseSubscriptionOption('].every((value) => revenuecat.includes(value)));
const strings = read('android/app/src/main/res/values/strings.xml');
check('AdMob retains production app ID resource and manifest metadata', /<string name="admob_app_id">ca-app-pub-7999682122277742~1488495964<\/string>/.test(strings) && /<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"\s+android:value="@string\/admob_app_id"/.test(manifest));
check('AdMob retains advertising ID permission', manifest.includes('android:name="com.google.android.gms.permission.AD_ID"'));
const ads = read('src/lib/adService.js');
check('AdMob retains initialization and consent seams', ['AdMob.initialize(', 'AdMob.requestConsentInfo(', 'AdMob.showConsentForm('].every((value) => ads.includes(value)));

const workflow = read('codemagic.yaml').split('\n  ios-capacitor-build:')[0];
const build = workflow.indexOf('script: npm run build');
const sync = workflow.indexOf('script: npx cap sync android');
const verify = workflow.indexOf('npm run verify:android-native-plugins');
const compile = workflow.indexOf('./gradlew assembleRelease bundleRelease');
check('Android workflow orders web build, Android sync, static gate, then Gradle', build >= 0 && sync > build && verify > sync && compile > verify);
check('Current CI and native notes identify Android Build 28 without changing iOS Build 33',
  workflow.includes('Verify Android Version 28 and native plugin wiring before Gradle')
  && read('AGENTS.md').includes('Android `versionCode` 28 is prepared')
  && read('ios/App/App.xcodeproj/project.pbxproj').includes('CURRENT_PROJECT_VERSION = 33;'));
check('Android workflow keeps signing and signature verification', workflow.includes('- ages-explorer-upload') && workflow.includes('jarsigner -verify -verbose -certs'));

for (const { label, ok } of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
const failures = results.filter(({ ok }) => !ok).length;
console.log(`\nAndroid native source verification: ${results.length - failures}/${results.length} checks passed.`);
if (failures) process.exit(1);