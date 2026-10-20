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
check('Photos requests add-only access and reports its true destination', !!saveSwift && saveSwift.includes('requestAuthorization(for: .addOnly') && saveSwift.includes('"destination": "photos"') && saveSwift.includes('"destination": "files"') && saveSwift.includes('photos_permission_denied'));

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
const { stampDepthFrame, liveDepthFigures } = await import('./src/lib/depthFreshness.js');
const stamped = stampDepthFrame({ figures: [{ trackId: 1, validForMs: 250 }] }, null, 1000);
check('Depth skeletons expire even when no further sensor frame arrives', liveDepthFigures(stamped, 1100).length === 1 && liveDepthFigures(stamped, 1250).length === 0);
check('A frame cannot extend a confirmed body beyond one second', liveDepthFigures(stampDepthFrame({ figures: [{ validForMs: 5000 }] }, null, 1000), 2001).length === 0);

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
check('Android remains versionCode 21', !!androidGradle && androidGradle.includes('versionCode 21'));
const appConfigurationList = objects.find((object) => /isa = XCConfigurationList;/.test(object.body) && appTarget?.body.includes(`buildConfigurationList = ${object.id} `));
const appConfigurations = objects.filter((object) => /isa = XCBuildConfiguration;/.test(object.body) && appConfigurationList?.body.includes(object.id));
check('App target has Debug and Release build configurations', appConfigurations.length === 2 && ['Debug', 'Release'].every((name) => appConfigurations.some((object) => object.body.includes(`name = ${name};`))));
for (const name of ['Debug', 'Release']) {
  const settings = appConfigurations.find((object) => object.body.includes(`name = ${name};`))?.body ?? '';
  check(`iOS ${name} is com.ages.explorer 1.0 (30)`, /CURRENT_PROJECT_VERSION = 30;/.test(settings) && /MARKETING_VERSION = 1\.0;/.test(settings) && /PRODUCT_BUNDLE_IDENTIFIER = com\.ages\.explorer;/.test(settings));
}
check('iOS has exactly two Build 30 stamps and no other build number', (pbxproj?.match(/CURRENT_PROJECT_VERSION = 30;/g) ?? []).length === 2 && (pbxproj?.match(/CURRENT_PROJECT_VERSION = [^;]+;/g) ?? []).length === 2);

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