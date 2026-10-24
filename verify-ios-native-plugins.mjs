#!/usr/bin/env node
// Dependency-free regression verifier for the iOS native plugin bridge.
//
// It asserts the ACTUAL registration path — the storyboard -> custom bridge
// controller -> capacitorDidLoad() instance registration lifecycle — plus the
// JS/native name, method, and event contracts the Environment Monitor and the
// LiDAR/Anomaly Camera and Save to Device depend on. It also follows Xcode file,
// build-file, App group and App target Sources references; Codemagic retains its
// separate Compile Sources guard. This verifier only reads source files.
//
// Usage: node verify-ios-native-plugins.mjs   (exits 1 with every failure listed)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const read = (path) => {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    return null;
  }
};

let failures = 0;
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ ok, label, detail });
  if (!ok) failures += 1;
};

// ── 1. The storyboard drives the custom controller, not stock CAPBridgeViewController
const storyboard = read('ios/App/App/Base.lproj/Main.storyboard');
check('Main.storyboard instantiates AgesBridgeViewController', !!storyboard && storyboard.includes('customClass="AgesBridgeViewController"'),
  'storyboard must point the bridge scene at the custom controller');
check('Main.storyboard resolves the controller from module App', !!storyboard && /<viewController[^>]*customClass="AgesBridgeViewController"[^>]*customModule="App"/.test(storyboard ?? ''),
  'Swift classes need customModule="App" for storyboard lookup');
check('Main.storyboard no longer instantiates stock CAPBridgeViewController', !!storyboard && !storyboard.includes('customClass="CAPBridgeViewController"'));

// ── 2. The controller registers all three plugin instances inside capacitorDidLoad()
const appDelegate = read('ios/App/App/AppDelegate.swift');
check('AppDelegate.swift declares AgesBridgeViewController as a CAPBridgeViewController', !!appDelegate && /class\s+AgesBridgeViewController:\s*CAPBridgeViewController/.test(appDelegate));
check('AppDelegate.swift overrides capacitorDidLoad()', !!appDelegate && /override\s+(?:open\s+)?func\s+capacitorDidLoad\(\)/.test(appDelegate));
check('capacitorDidLoad calls super first', !!appDelegate && /capacitorDidLoad\(\)\s*\{[^}]*super\.capacitorDidLoad\(\)/s.test(appDelegate));
check('AgesSensorsPlugin instance is registered with the bridge', !!appDelegate && /registerPluginInstance\(\s*AgesSensorsPlugin\(\)\s*\)/.test(appDelegate));
check('AgesDepthPlugin instance is registered with the bridge', !!appDelegate && /registerPluginInstance\(\s*AgesDepthPlugin\(\)\s*\)/.test(appDelegate));
check('AgesSaveToDevicePlugin instance is registered with the bridge', !!appDelegate && /registerPluginInstance\(\s*AgesSaveToDevicePlugin\(\)\s*\)/.test(appDelegate));
{
  // Registration must live INSIDE the capacitorDidLoad hook (registration after
  // the bridge exists, before the web app loads), not somewhere else in the file.
  const hookBody = appDelegate?.match(/override\s+(?:open\s+)?func\s+capacitorDidLoad\(\)\s*\{([^}]*)\}/s)?.[1] ?? '';
  for (const plugin of ['AgesSensorsPlugin', 'AgesDepthPlugin', 'AgesSaveToDevicePlugin']) {
    const registrations = [...hookBody.matchAll(new RegExp(`registerPluginInstance\\(\\s*${plugin}\\(\\)\\s*\\)`, 'g'))];
    check(`${plugin} is registered once inside capacitorDidLoad after super`, registrations.length === 1 && hookBody.indexOf('super.capacitorDidLoad()') >= 0 && registrations[0].index > hookBody.indexOf('super.capacitorDidLoad()'));
  }
}

// ── 3. Native plugin identities, methods, and events are unchanged or additive
const sensorsSwift = read('ios/App/App/AgesSensorsPlugin.swift');
check('AgesSensorsPlugin keeps jsName "AgesSensors"', !!sensorsSwift && sensorsSwift.includes('jsName = "AgesSensors"'));
check('AgesSensorsPlugin keeps its identifier', !!sensorsSwift && sensorsSwift.includes('identifier = "AgesSensorsPlugin"'));
for (const m of ['isSupported', 'start', 'stop']) {
  check(`AgesSensorsPlugin exposes ${m}()`, !!sensorsSwift && sensorsSwift.includes(`name: "${m}"`) && sensorsSwift.includes(`func ${m}(_ call: CAPPluginCall)`));
}
check('AgesSensorsPlugin still emits the "reading" event', !!sensorsSwift && sensorsSwift.includes('notifyListeners("reading"'));
check('AgesSensorsPlugin now reports faults on the "error" event', !!sensorsSwift && sensorsSwift.includes('notifyListeners("error"'));
check('AgesSensorsPlugin error payload carries a stable code/category', !!sensorsSwift && /"code":\s*code/.test(sensorsSwift) && /"category":\s*category/.test(sensorsSwift));

const depthSwift = read('ios/App/App/AgesDepthPlugin.swift');
check('AgesDepthPlugin keeps jsName "AgesDepth"', !!depthSwift && depthSwift.includes('jsName = "AgesDepth"'));
check('AgesDepthPlugin keeps its identifier', !!depthSwift && depthSwift.includes('identifier = "AgesDepthPlugin"'));
for (const m of ['isSupported', 'start', 'stop', 'setDetection']) {
  check(`AgesDepthPlugin exposes ${m}()`, !!depthSwift && depthSwift.includes(`name: "${m}"`) && depthSwift.includes(`func ${m}(_ call: CAPPluginCall)`));
}
check('AgesDepthPlugin still emits the "frame" event', !!depthSwift && depthSwift.includes('notifyListeners("frame"'));
check('AgesDepthPlugin still emits the "error" event', !!depthSwift && depthSwift.includes('notifyListeners("error"'));
check('AgesDepthPlugin gates depth on LiDAR frame semantics', !!depthSwift && depthSwift.includes('supportsFrameSemantics(.sceneDepth)'));
check('AgesDepthPlugin checks camera permission before running ARKit', !!depthSwift && depthSwift.includes('authorizationStatus(for: .video)') && depthSwift.includes('"camera_permission_denied"'));
check('AgesDepthPlugin classifies ARKit session failures', !!depthSwift && depthSwift.includes('.cameraUnauthorized') && depthSwift.includes('.sensorUnavailable') && depthSwift.includes('.unsupportedConfiguration'));

const saveSwift = read('ios/App/App/AgesSaveToDevicePlugin.swift');
check('AgesSaveToDevicePlugin keeps its bridged class and identifier', !!saveSwift && /@objc\(AgesSaveToDevicePlugin\)/.test(saveSwift) && /class\s+AgesSaveToDevicePlugin:\s*CAPPlugin,\s*CAPBridgedPlugin/.test(saveSwift) && saveSwift.includes('identifier = "AgesSaveToDevicePlugin"'));
check('AgesSaveToDevicePlugin keeps jsName "AgesSaveToDevice"', !!saveSwift && saveSwift.includes('jsName = "AgesSaveToDevice"'));
check('AgesSaveToDevicePlugin exposes saveMedia() as a promise', !!saveSwift && /CAPPluginMethod\(name: "saveMedia", returnType: CAPPluginReturnPromise\)/.test(saveSwift) && saveSwift.includes('func saveMedia(_ call: CAPPluginCall)'));
check('AgesSaveToDevicePlugin keeps filePath/mediaType/displayName inputs', !!saveSwift && ['filePath', 'mediaType', 'displayName'].every((key) => saveSwift.includes(`call.getString("${key}")`)));
check('AgesSaveToDevicePlugin keeps Photos image/video and Documents audio paths', !!saveSwift && saveSwift.includes('PHPhotoLibrary.shared().performChanges') && saveSwift.includes('with: image ? .photo : .video') && saveSwift.includes('type == "audio"') && saveSwift.includes('saveToDocuments(source: source') && saveSwift.includes('.documentDirectory') && saveSwift.includes('FileManager.default.copyItem'));
check('Recording preparation is a registered native promise', !!saveSwift && saveSwift.includes('CAPPluginMethod(name: "prepareMedia", returnType: CAPPluginReturnPromise)') && saveSwift.includes('func prepareMedia(_ call: CAPPluginCall)'));
check('Native export reads precise duration, trims the full asset and validates output duration', !!saveSwift && saveSwift.includes('AVURLAssetPreferPreciseDurationAndTimingKey: true') && saveSwift.includes('duration - kept') && saveSwift.includes('exporter.timeRange = CMTimeRange') && saveSwift.includes('abs(actual - kept) < 0.75'));
check('Photos requests add-only access, rejects denied/restricted access and reports its true destination', !!saveSwift && saveSwift.includes('authorizationStatus(for: .addOnly)') && saveSwift.includes('status == .notDetermined') && saveSwift.includes('requestAuthorization(for: .addOnly') && saveSwift.includes('guard status == .authorized || status == .limited else') && saveSwift.includes('Allow this app to add photos in Settings, then try again.') && saveSwift.includes('"destination": "photos"') && saveSwift.includes('"destination": "files"') && saveSwift.includes('photos_permission_denied'));

// ── 4. JS seams register the same names and expose the same steps/events
const sensorsJs = read('src/lib/nativeSensors.js');
check("nativeSensors.js registers JS plugin 'AgesSensors'", !!sensorsJs && sensorsJs.includes("registerPlugin('AgesSensors')"));
check('nativeSensors.js keeps the reading subscription', !!sensorsJs && sensorsJs.includes("addListener('reading'"));
check('nativeSensors.js exposes the error subscription (onSensorError)', !!sensorsJs && /export function onSensorError/.test(sensorsJs) && sensorsJs.includes("addListener('error'"));
check('nativeSensors.js distinguishes web / unregistered / connected', !!sensorsJs && sensorsJs.includes("status: 'web'") && sensorsJs.includes("status: 'unregistered'") && sensorsJs.includes("status: 'connected'"));
check('nativeSensors.js keeps start/stop seam', !!sensorsJs && /export async function startSensors/.test(sensorsJs) && /export async function stopSensors/.test(sensorsJs));

const depthJs = read('src/lib/nativeDepth.js');
check("nativeDepth.js registers JS plugin 'AgesDepth'", !!depthJs && depthJs.includes("registerPlugin('AgesDepth')"));
check('nativeDepth.js keeps the frame subscription', !!depthJs && depthJs.includes("addListener('frame'"));
check('nativeDepth.js exposes the error subscription (onDepthError)', !!depthJs && /export function onDepthError/.test(depthJs) && depthJs.includes("addListener('error'"));
check('nativeDepth.js distinguishes web / unregistered / connected', !!depthJs && depthJs.includes("status: 'web'") && depthJs.includes("status: 'unregistered'") && depthJs.includes("status: 'connected'"));
check('nativeDepth.js normalises coded start rejections', !!depthJs && depthJs.includes("'camera_permission_denied'") && depthJs.includes("'depth_unsupported'") && depthJs.includes("'plugin_unavailable'"));
check('nativeDepth.js keeps start/stop/setDetection seams', !!depthJs && /export async function startDepthStream/.test(depthJs) && /export async function stopDepthStream/.test(depthJs) && /export async function setDepthDetection/.test(depthJs));

const saveJs = read('src/lib/saveToDevice.js');
const deviceMediaJs = read('src/lib/deviceMedia.js');
check("Shared device media registers 'AgesSaveToDevice' and saveToDevice calls saveMedia", !!saveJs && !!deviceMediaJs && deviceMediaJs.includes("registerPlugin('AgesSaveToDevice')") && saveJs.includes("from '@/lib/deviceMedia'") && saveJs.includes('deviceMedia.saveMedia('));
check('Binary copies omit text encoding and verify the byte count', !!deviceMediaJs && deviceMediaJs.includes('Filesystem.writeFile({ data, path, directory: Directory.Cache })') && deviceMediaJs.includes('stat.size !== blob.size'));
check('All seven trim-enabled tools use finished-recording preparation', ['SLSCamera', 'SiegConsole', 'PhoneREMDevice', 'AcousticAnomalySweeper', 'AlphabetSweeper', 'YesNoSweeper', 'LocationTermBank'].every((name) => { const source = read(`src/components/${name}.jsx`); return source?.includes('usePreparedRecording(') && !source.includes('getTrimmedBlob'); }));

// Eight focused source-contract checks for the finished-video / original-recovery
// paths. These inspect the real bridge and callers; they do not simulate Photos.
const preparedHook = read('src/hooks/usePreparedRecording.js') ?? '';
const saveButtons = read('src/components/EvidenceSaveButtons.jsx') ?? '';
const preparationUi = read('src/components/RecordingPreparation.jsx') ?? '';
const preparationJs = read('src/lib/prepareRecording.js') ?? '';
const normalSave = saveJs?.split('export async function recoverOriginalToDevice')[0] ?? '';
const recoverySave = saveJs?.split('export async function recoverOriginalToDevice')[1]?.split('export function buildDeviceFilename')[0] ?? '';
const photosSave = saveSwift?.split('private func saveToPhotos')[1]?.split('private func saveToDocuments')[0] ?? '';
check('JS prepareMedia request and filesystem response match the Swift promise contract', !!deviceMediaJs && deviceMediaJs.includes('deviceMedia.prepareMedia({ filePath: input, mediaType:') && deviceMediaJs.includes('trimSeconds });') && deviceMediaJs.includes('output = result.filePath') && deviceMediaJs.includes('Filesystem.readFile({ path: output })') && deviceMediaJs.includes('type: result.mimeType') && saveSwift?.includes('trimSeconds: call.getDouble("trimSeconds")') && saveSwift?.includes('"filePath": output.absoluteString, "mimeType": audioOnly ? "audio/mp4" : "video/mp4"'));
check('Only iOS MP4 prepared video reaches the prepared Photos branch', !!deviceMediaJs && deviceMediaJs.includes("Capacitor.getPlatform() === 'ios' && mimeType?.split(';')[0] !== 'video/mp4'") && deviceMediaJs.includes('assertPreparedVideoType(result.mimeType)') && normalSave.includes('assertPreparedVideoType(prepared.type)') && normalSave.indexOf('assertPreparedVideoType(prepared.type)') < normalSave.indexOf('writeMediaTempFile(prepared)') && normalSave.includes('filePath: uri, mediaType, displayName, prepared: true') && preparationJs.includes('preparedBlobs.has(blob)') && saveSwift?.includes('call.getBool("prepared") == true') && saveSwift?.includes('saveToPhotos(source: source, image: false, cleanup: false'));
check('Photos completion resolves success only and rejects write errors', photosSave.includes('PHPhotoLibrary.shared().performChanges') && photosSave.includes('request.addResource(with: image ? .photo : .video, fileURL: source') && /completionHandler: \{ success, error in[\s\S]*if success \{ call\.resolve\(\["success": true, "destination": "photos"/.test(photosSave) && photosSave.includes('else { call.reject("Could not save to Photos:') && photosSave.indexOf('call.resolve(') > photosSave.indexOf('completionHandler:'));
check('JS and UI await native confirmation and display its returned destination/note', normalSave.includes("if (!result?.success) throw new Error('The device did not confirm the save.')") && recoverySave.includes('if (!result?.success) throw') && saveButtons.includes('await saveBlobToDevice(deviceBlob, filename)') && saveButtons.includes('await recoverOriginalToDevice(originalBlob, filename)') && saveButtons.includes('setSavedToDevice(labels[result.destination]') && saveButtons.includes('setDeviceNote(result.note || labels[result.destination]') && saveButtons.indexOf('setSavedToDevice(labels[result.destination]') > saveButtons.indexOf('await saveBlobToDevice('));
check('Preparation failure keeps the original separate from the null finished blob', preparedHook.includes('originalBlob: source') && preparedHook.includes('blob: null, error: error.message') && preparedHook.includes('const blob = needed ? (current ? result.blob : null) : source') && preparedHook.includes('retry: () => setAttempt'));
check('Explicit original recovery is unprepared, retryable, cleaned up and distinct from Photos/temp errors', recoverySave.includes('writeMediaTempFile(originalBlob)') && recoverySave.includes('prepared: false') && recoverySave.includes("['photos', 'files'].includes(result.destination)") && recoverySave.includes('finally') && recoverySave.includes('removeMediaTempFile(uri)') && normalSave.includes("!['recording_export_failed', 'recording_format_invalid'].includes(cause.code)) throw cause") && saveButtons.includes("originalBlob?.size > 0 && !!failedPreparation") && saveButtons.includes('onClick={() => handleDevice(true)} disabled={saving || deviceSaving || preparing}') && saveButtons.includes('if (e.code === \'recording_preparation_failed\')') && saveButtons.includes('Retry preparation') && preparationUi.includes('onClick={retry}') && preparationUi.includes('Recover original below') && saveButtons.includes('!!failedPreparation'));
check('Native unprepared conversion failure copies the unchanged original to Files, never labels it Photos', /case \.failure:[\s\S]*source\.pathExtension[\s\S]*self\.saveToDocuments\(source: source, displayName: originalName, call: call\)/.test(saveSwift ?? '') && saveSwift?.includes('FileManager.default.copyItem(at: source, to: destination)') && saveSwift?.includes('"destination": "files"') && saveSwift?.includes('not Photos.'));
const trimCallers = ['AcousticAnomalySweeper', 'AlphabetSweeper', 'LocationTermBank', 'PhoneREMDevice', 'SLSCamera', 'YesNoSweeper'];
const siegReview = read('src/components/sieg/SiegReview.jsx') ?? '';
const siegSource = read('src/components/SiegConsole.jsx') ?? '';
const environmentSource = read('src/components/EnvironmentalAnomalyMonitor.jsx') ?? '';
check('All seven trim tools and raw Environmental Monitor pass distinct finished/original inputs to shared saving', trimCallers.every((name) => /<EvidenceSaveButtons[^>]*deviceBlob=\{displayBlob\} originalBlob=\{preparedRecording.originalBlob\}[^>]*preparationError=\{preparedRecording.error\}/.test(read(`src/components/${name}.jsx`) ?? '')) && siegSource.includes('usePreparedRecording(') && siegSource.includes('preparation={preparedRecording}') && siegReview.includes('deviceBlob={blob} originalBlob={preparation?.originalBlob}') && environmentSource.includes('deviceBlob={videoBlob} originalBlob={videoBlob}') && saveButtons.includes("from '@/lib/saveToDevice'"));

// Audio Recorder opts into a direct, unchanged iOS Files copy. These guards
// inspect source contracts, not a physical microphone, Files app or Photos write.
const toolkitSource = read('src/pages/Toolkit.jsx') ?? '';
const recorderStart = toolkitSource.split('const startRecording = async () => {')[1]?.split('const stopRecording')[0] ?? '';
const recorderSave = toolkitSource.split('const saveRecording = async (isPrivate = true) => {')[1]?.split('const fetchWeatherByCoords')[0] ?? '';
check('iOS Audio Recorder feature-detects MIME and retries without a constraint; web/Android retain WebM', recorderStart.includes("const isIos = Capacitor.getPlatform() === 'ios'") && recorderStart.includes("['audio/mp4', 'audio/webm', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported?.(type))") && /catch \{\s*mediaRecorder = new MediaRecorder\(stream\);/.test(recorderStart) && /else \{\s*mediaRecorder = new MediaRecorder\(stream, \{ mimeType: 'audio\/webm' \}\);/.test(recorderStart));
check('Audio Recorder Blob and iOS Journal metadata use actual MIME without relabelling original bytes', recorderStart.includes("mediaRecorder.mimeType || chunksRef.current.find(chunk => chunk.type)?.type || ''") && recorderStart.includes(" : 'audio/webm'") && recorderStart.includes('new Blob(chunksRef.current, { type: mimeType })') && recorderSave.includes("Capacitor.getPlatform() === 'ios'") && recorderSave.includes("`evp_session.${mediaExtension(recordedBlob, 'bin')}`, { type: recordedBlob.type }") && recorderSave.includes("new File([recordedBlob], 'evp_session.webm', { type: 'audio/webm' })"));
check('Audio extension mapping distinguishes MP4, WebM and Ogg and keeps other callers default fallback', deviceMediaJs?.includes("'audio/mp4': 'm4a'") && deviceMediaJs?.includes("'audio/webm': 'webm'") && deviceMediaJs?.includes("'audio/ogg': 'ogg'") && deviceMediaJs?.includes("mediaExtension(blob, fallback = 'webm')") && saveJs?.includes("buildDeviceFilename(prefix, blob, fallbackExtension = 'webm')") && saveJs?.includes('mediaExtension(blob, fallbackExtension)'));
check('Only Audio Recorder opts into original-to-Files; all other tool save defaults remain off', toolkitSource.includes('deviceBlob={recordedBlob} originalBlob={recordedBlob} iosAudioOriginalToFiles') && saveButtons.includes('iosAudioOriginalToFiles = false') && [...trimCallers.map(name => read(`src/components/${name}.jsx`) ?? ''), siegSource, siegReview, environmentSource].every(source => !source.includes('iosAudioOriginalToFiles')));
check('iOS Audio Recorder bypasses preparation for its original audio; non-iOS and other tools keep normal saves', saveButtons.includes("const directAudioFiles = iosAudioOriginalToFiles && Capacitor.getPlatform() === 'ios'") && saveButtons.includes('const input = recover || directAudioFiles ? originalBlob : deviceBlob') && saveButtons.includes("directAudioFiles && !input.type.startsWith('audio/')") && saveButtons.includes("const isAndroid = Capacitor.getPlatform() === 'android'") && /const result = recover \|\| directAudioFiles\s*\? await recoverOriginalToDevice\(originalBlob, filename\)\s*: isAndroid\s*\? await saveBlobToDevice\(deviceBlob, filename, \{ trimMode, trimSeconds \}\)\s*: await saveBlobToDevice\(deviceBlob, filename\);/.test(saveButtons) && recoverySave.includes("mediaType: originalBlob.type.startsWith('audio') ? 'audio' : 'video'") && recoverySave.includes('prepared: false'));
check('Native audio copies directly to Documents regardless of prepared; prepared video still goes to Photos', /if type == "audio" \{\s*saveToDocuments\(source: source, displayName: name, call: call\)\s*\} else if type == "image"/.test(saveSwift ?? '') && /else if call.getBool\("prepared"\) == true \{\s*saveToPhotos\(source: source, image: false, cleanup: false, call: call\)/.test(saveSwift ?? '') && saveSwift?.includes('FileManager.default.copyItem(at: source, to: destination)'));
check('Audio Recorder local device failure does not block Journal/Community; actual preparation and in-flight guards remain', saveButtons.includes('const blocked = saving || deviceSaving || preparing || !!preparationError || (!directAudioFiles && !!savePreparationError)') && !saveButtons.match(/const blocked =[^;]*deviceError/) && /onClick=\{\(\) => onSave\(true\)\}\s*disabled=\{blocked\}/.test(saveButtons) && /onClick=\{\(\) => onSave\(false\)\}\s*disabled=\{blocked\}/.test(saveButtons) && saveButtons.includes('if (!input || deviceSaving || saving || preparing) return'));
check('Audio Recorder retains private/public semantics, Community location rule and upload/GPS/save-gate ordering', recorderSave.includes("!isPrivate && (gpsResult.location_source === 'NONE' || gpsResult.latitude == null)") && recorderSave.includes('is_private: isPrivate') && recorderSave.includes('await refundEvidenceSave()') && recorderSave.indexOf('await base44.integrations.Core.UploadFile') >= 0 && recorderSave.indexOf('await base44.integrations.Core.UploadFile') < recorderSave.indexOf('await captureGpsForSave()') && recorderSave.indexOf('await captureGpsForSave()') < recorderSave.indexOf('await gateEvidenceSave()') && recorderSave.indexOf('await gateEvidenceSave()') < recorderSave.indexOf('await base44.entities.Evidence.create('));
check('Audio Recorder reports Files and unchanged original copying, never promises conversion or Photos', saveButtons.includes("directAudioFiles ? 'Save to Files' : 'Save to Device'") && saveButtons.includes("directAudioFiles ? 'Files / On My iPhone'") && saveButtons.includes('Copies the unchanged original audio to Files, not Photos. No format conversion is performed.') && saveButtons.includes("files: 'Saved to Files'") && saveSwift?.includes('Saved to Files, under On My iPhone /'));

check('Depth work cannot queue old camera frames and body tracks expire', !!depthSwift && depthSwift.includes('frameGate.wait(timeout: .now())') && depthSwift.includes('bodyTracks.removeAll') && depthSwift.includes('poseConfirmationWindow: TimeInterval = 1.0'));
const { audioAcquire, audioRelease, isAudioBusy } = await import('./src/lib/hauntedAudio.js');
const ownerA = audioAcquire('regression A');
const ownerB = audioAcquire('regression B');
audioRelease(ownerA);
audioRelease(ownerA);
check('Releasing one audio owner twice cannot release another owner', isAudioBusy());
audioRelease(ownerB);
check('Music is unblocked when every audio owner releases', !isAudioBusy());
const { createDepthDiagTracker, updateDepthDiag, finalizeDepthDiag } = await import('./src/lib/depthDiagnostic.js');
const diagnostic = createDepthDiagTracker('sieg', 'regression', { minHeight: 20 });
updateDepthDiag(diagnostic, { poseCount: 0, poseCandidates: 1, rejectedPoseSize: 1 });
const diagnosticRecord = finalizeDepthDiag(diagnostic);
check('Depth diagnostics distinguish rejected body size and store fractional height', diagnosticRecord.min_height === 0.2 && diagnosticRecord.failure_reason.includes('minimum figure-height'));
// depthFreshness.js imports through the app's @/ alias, which plain Node does not
// resolve, so its own two rules are asserted on the source: movement is measured
// against the frame being replaced, and a confirmed body stays on screen for one
// second at most and then expires on its own.
const depthFreshnessJs = read('src/lib/depthFreshness.js');
check('Depth freshness measures movement against the frame being replaced', !!depthFreshnessJs && depthFreshnessJs.includes('annotateFigureMotion(data.figures, previous?.figures, receivedAt)'));
check('Depth freshness caps a confirmed body at one second and expires it on its own', !!depthFreshnessJs && depthFreshnessJs.includes('Math.min(1000') && depthFreshnessJs.includes('expiresAt > now'));
const motion = await import('./src/lib/figureMotion.js');
const still = { nose: [0.5, 0.2], neck: [0.5, 0.3], lShoulder: [0.45, 0.32], rShoulder: [0.55, 0.32] };
const idle = { nose: [0.503, 0.202], neck: [0.502, 0.301], lShoulder: [0.452, 0.323], rShoulder: [0.548, 0.319] };
const waving = { nose: [0.5, 0.2], neck: [0.5, 0.3], lShoulder: [0.45, 0.32], rShoulder: [0.75, 0.12] };
check('Movement is only measured against the same tracked body', Number.isNaN(motion.jointTravel(still, waving)) === false && Number.isNaN(motion.annotateFigureMotion([{ trackId: 9, joints: waving }], [{ trackId: 7, joints: still }], 1000)[0].motion));
const idleFigure = motion.annotateFigureMotion([{ trackId: 7, joints: idle }], [{ trackId: 7, joints: still, lastMoveAt: 0 }], 1000)[0];
check('An idle body is a figure but not a moving one', idleFigure.movedNow === false && motion.figureIsMoving(idleFigure, 1000) === false);
const movingFigure = motion.annotateFigureMotion([{ trackId: 7, joints: waving }], [{ trackId: 7, joints: still, lastMoveAt: 0 }], 1000)[0];
check('A waving body confirms movement and holds it for the window', movingFigure.movedNow === true && motion.figureIsMoving(movingFigure, 1800) === true && motion.figureIsMoving(movingFigure, 2000) === false);
const heldFigure = motion.annotateFigureMotion([{ trackId: 7, joints: still }], [{ trackId: 7, joints: still, lastMoveAt: 900 }], 1000)[0];
check('A confirmed movement carries into the next frame, then expires', motion.figureIsMoving(heldFigure, 1700) === true && motion.figureIsMoving(heldFigure, 1800) === false && motion.movingFigureCount([heldFigure, idleFigure], 1700) === 1);
check('A couple of shared joints cannot confirm movement', Number.isNaN(motion.jointTravel({ nose: [0, 0], neck: [0, 0] }, { nose: [0.5, 0.5], neck: [0.5, 0.5] })));
check('Both depth consumers measure movement against the frame they replace', /stampDepthFrame\(data, imageEl, receivedAt, depthFrameRef\.current\)/.test(read('src/components/SLSCamera.jsx') ?? '') && /stampDepthFrame\(data, image, receivedAt, depthFrameRef\.current\)/.test(read('src/components/SiegConsole.jsx') ?? ''));
const depthFrameJs = read('src/lib/depthFrame.js');
check('The recorded depth frame labels a moving figure', !!depthFrameJs && depthFrameJs.includes('MOVEMENT CONFIRMED') && depthFrameJs.includes('movingFigureCount'));
check('A moving figure is drawn lit, with a trail of where each limb just was', !!read('src/lib/figureSkeleton.js') && read('src/lib/figureSkeleton.js').includes('drawMovementTrails') && read('src/lib/siegDisplay.js').includes('figureIsMoving'));
check('SIEG upgrades the figure event it already logged', read('src/components/SiegConsole.jsx')?.includes('confirmFigureMovement(') && read('src/components/sieg/SiegEventLog.jsx')?.includes('e.movement'));

// ── 5. The three consumers actually wire the error seams in
const eam = read('src/components/EnvironmentalAnomalyMonitor.jsx');
check('EnvironmentalAnomalyMonitor subscribes to sensor errors', !!eam && /import\s*\{[^}]*onSensorError[^}]*\}\s*from\s*'@\/lib\/nativeSensors'/.test(eam) && /onSensorError\(/.test(eam));
check('EnvironmentalAnomalyMonitor subscribes before starting the stream', !!eam && eam.indexOf('onSensorError(') < eam.indexOf('await startSensors(10)'));

const sls = read('src/components/SLSCamera.jsx');
check('SLSCamera subscribes to depth errors', !!sls && /import\s*\{[^}]*onDepthError[^}]*\}\s*from\s*'@\/lib\/nativeDepth'/.test(sls) && /onDepthError\(/.test(sls));
check('SLSCamera releases the error listener and startup timers in stopCamera', !!sls && sls.includes('depthErrorUnsubRef.current()') && sls.includes('clearTimeout(depthTimeoutRef.current)'));

const sieg = read('src/components/SiegConsole.jsx');
check('SiegConsole subscribes to depth errors', !!sieg && /import\s*\{[^}]*onDepthError[^}]*\}\s*from\s*'@\/lib\/nativeDepth'/.test(sieg) && /onDepthError\(/.test(sieg));
check('SiegConsole subscribes to sensor errors', !!sieg && /import\s*\{[^}]*onSensorError[^}]*\}\s*from\s*'@\/lib\/nativeSensors'/.test(sieg) && /onSensorError\(/.test(sieg));
check('SiegConsole releases both error subscriptions in teardownDevices', !!sieg && sieg.includes('depthErrorUnsubRef.current()') && sieg.includes('envErrorUnsubRef.current()'));

// ── 6. The privacy keys the native paths need are still declared
const infoPlist = read('ios/App/App/Info.plist');
for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSMotionUsageDescription']) {
  check(`Info.plist keeps ${key}`, !!infoPlist && infoPlist.includes(key));
}
check('Info.plist declares a nonempty Photos add-only usage description', /<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>[^<\s][^<]*<\/string>/.test(infoPlist ?? ''));
for (const key of ['UIFileSharingEnabled', 'LSSupportsOpeningDocumentsInPlace']) {
  check(`Info.plist enables ${key}`, new RegExp(`<key>${key}</key>\\s*<true\\s*/>`).test(infoPlist ?? ''));
}

// ── 7. Follow Xcode membership references, not just matching Sources comments
const pbxproj = read('ios/App/App.xcodeproj/project.pbxproj');
const objects = [...(pbxproj ?? '').matchAll(/^\t\t([A-F0-9]{24})(?: \/\* [^\n]*? \*\/)? = \{([^\n]*\};|[\s\S]*?^\t\t\};)/gm)].map((match) => ({ id: match[1], body: match[2] }));
const appGroup = objects.find((object) => /isa = PBXGroup;/.test(object.body) && /path = App;/.test(object.body));
const appTarget = objects.find((object) => /isa = PBXNativeTarget;/.test(object.body) && /name = App;/.test(object.body));
const sources = objects.find((object) => /isa = PBXSourcesBuildPhase;/.test(object.body) && appTarget?.body.includes(object.id));
check('App target references its Sources build phase', !!sources);
for (const plugin of ['AgesSensorsPlugin', 'AgesDepthPlugin', 'AgesSaveToDevicePlugin']) {
  const files = objects.filter((object) => /isa = PBXFileReference;/.test(object.body) && object.body.includes(`path = ${plugin}.swift;`));
  const file = files[0];
  const builds = objects.filter((object) => /isa = PBXBuildFile;/.test(object.body) && file && object.body.includes(`fileRef = ${file.id} `));
  check(`${plugin}.swift has one Xcode file reference`, files.length === 1);
  check(`${plugin}.swift belongs to the App group`, !!file && !!appGroup?.body.includes(file.id));
  check(`${plugin}.swift has one build-file reference in App Sources`, builds.length === 1 && !!sources?.body.includes(builds[0].id));
}

// ── 8. Protected version guards (regression tripwires only — nothing here edits)
const androidGradle = read('android/app/build.gradle');
check('Android test build is versionCode 25', !!androidGradle && androidGradle.includes('versionCode 25'));
const appConfigurationList = objects.find((object) => /isa = XCConfigurationList;/.test(object.body) && appTarget?.body.includes(`buildConfigurationList = ${object.id} `));
const appConfigurations = objects.filter((object) => /isa = XCBuildConfiguration;/.test(object.body) && appConfigurationList?.body.includes(object.id));
check('App target has Debug and Release build configurations', appConfigurations.length === 2 && ['Debug', 'Release'].every((name) => appConfigurations.some((object) => object.body.includes(`name = ${name};`))));
for (const name of ['Debug', 'Release']) {
  const settings = appConfigurations.find((object) => object.body.includes(`name = ${name};`))?.body ?? '';
  check(`iOS ${name} is com.ages.explorer 1.0 (33)`, /CURRENT_PROJECT_VERSION = 33;/.test(settings) && /MARKETING_VERSION = 1\.0;/.test(settings) && /PRODUCT_BUNDLE_IDENTIFIER = com\.ages\.explorer;/.test(settings));
}
const codemagic = read('codemagic.yaml') ?? '';
check('iOS has exactly two Build 33 stamps and Codemagic stamps/guards the same build', (pbxproj?.match(/CURRENT_PROJECT_VERSION = 33;/g) ?? []).length === 2 && (pbxproj?.match(/CURRENT_PROJECT_VERSION = [^;]+;/g) ?? []).length === 2 && codemagic.includes('agvtool new-version -all 33') && codemagic.includes('CURRENT_PROJECT_VERSION = 33;') && codemagic.includes('[ "$BUNDLE_VERSION" = "33" ]') && !/Build 32|CFBundleVersion 32|build number 32/.test(codemagic));

// ── Report
const width = Math.max(...results.map((r) => r.label.length));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(width)}${r.ok || !r.detail ? '' : `  (${r.detail})`}`);
}
console.log('');
if (failures > 0) {
  console.error(`iOS native plugin verification FAILED — ${failures} check${failures === 1 ? '' : 's'} broken.`);
  process.exit(1);
}
console.log(`iOS native plugin verification passed — ${results.length} checks (storyboard lifecycle, native/JS contracts, consumer wiring, privacy keys, Xcode membership, version guards).`);