#!/usr/bin/env node
// Dependency-free regression verifier for the iOS native plugin bridge.
//
// It asserts the ACTUAL registration path — the storyboard -> custom bridge
// controller -> capacitorDidLoad() instance registration lifecycle — plus the
// JS/native name, method, and event contracts the Environment Monitor and the
// LiDAR/Anomaly Camera depend on. It deliberately does NOT re-implement the old
// "AgesSensorsPlugin.swift in Sources" Compile Sources grep that codemagic.yaml
// already owns: this file checks wiring and contracts, not Xcode build phases.
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

// ── 2. The controller registers both plugin instances inside capacitorDidLoad()
const appDelegate = read('ios/App/App/AppDelegate.swift');
check('AppDelegate.swift declares AgesBridgeViewController as a CAPBridgeViewController', !!appDelegate && /class\s+AgesBridgeViewController:\s*CAPBridgeViewController/.test(appDelegate));
check('AppDelegate.swift overrides capacitorDidLoad()', !!appDelegate && /override\s+(?:open\s+)?func\s+capacitorDidLoad\(\)/.test(appDelegate));
check('capacitorDidLoad calls super first', !!appDelegate && /capacitorDidLoad\(\)\s*\{[^}]*super\.capacitorDidLoad\(\)/s.test(appDelegate));
check('AgesSensorsPlugin instance is registered with the bridge', !!appDelegate && /registerPluginInstance\(\s*AgesSensorsPlugin\(\)\s*\)/.test(appDelegate));
check('AgesDepthPlugin instance is registered with the bridge', !!appDelegate && /registerPluginInstance\(\s*AgesDepthPlugin\(\)\s*\)/.test(appDelegate));
{
  // Registration must live INSIDE the capacitorDidLoad hook (registration after
  // the bridge exists, before the web app loads), not somewhere else in the file.
  const hook = appDelegate?.indexOf('capacitorDidLoad()') ?? -1;
  const sensorsReg = appDelegate?.indexOf('registerPluginInstance(AgesSensorsPlugin())') ?? -1;
  const depthReg = appDelegate?.indexOf('registerPluginInstance(AgesDepthPlugin())') ?? -1;
  check('Both registrations run after the capacitorDidLoad hook', hook >= 0 && sensorsReg > hook && depthReg > hook);
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

// ── 7. Protected version guards (regression tripwires only — nothing here edits)
const androidGradle = read('android/app/build.gradle');
check('Android remains versionCode 19', !!androidGradle && androidGradle.includes('versionCode 19'));
const pbxproj = read('ios/App/App.xcodeproj/project.pbxproj');
check('iOS build settings remain CURRENT_PROJECT_VERSION = 27', !!pbxproj && (pbxproj.match(/CURRENT_PROJECT_VERSION = 27;/g) || []).length >= 2);
check('iOS project has no unreleased Build 28 stamp', !!pbxproj && !pbxproj.includes('CURRENT_PROJECT_VERSION = 28;'));

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
console.log(`iOS native plugin verification passed — ${results.length} checks (storyboard lifecycle, native/JS contracts, consumer wiring, privacy keys, version guards).`);