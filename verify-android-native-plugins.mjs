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
for (const [key, value] of [['namespace', '"com.ages.explorer"'], ['applicationId', '"com.ages.explorer"'], ['versionCode', '21'], ['versionName', '"1.0"']]) {
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
check('Save retains modern scoped MediaStore insert/copy behavior', /if\s*\(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.Q\)\s*\{\s*values\.put\(MediaStore\.MediaColumns\.RELATIVE_PATH, subDir\);\s*\}/.test(save) && ['MediaStore.Images.Media.EXTERNAL_CONTENT_URI', 'MediaStore.Video.Media.EXTERNAL_CONTENT_URI', 'MediaStore.Audio.Media.EXTERNAL_CONTENT_URI', 'resolver.insert(collection, values)', 'resolver.openOutputStream(uri)', 'out.write(buf, 0, len)'].every((value) => save.includes(value)));
const saveJs = read('src/lib/saveToDevice.js');
check('JS Save seam registers AgesSaveToDevice and calls saveMedia', saveJs.includes("registerPlugin('AgesSaveToDevice')") && saveJs.includes('AgesSaveToDevice.saveMedia('));

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
check('Android workflow keeps signing and signature verification', workflow.includes('- ages-explorer-upload') && workflow.includes('jarsigner -verify -verbose -certs'));

for (const { label, ok } of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
const failures = results.filter(({ ok }) => !ok).length;
console.log(`\nAndroid native source verification: ${results.length - failures}/${results.length} checks passed.`);
if (failures) process.exit(1);