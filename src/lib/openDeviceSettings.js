import { Capacitor, registerPlugin } from '@capacitor/core';

// Local Android plugin (android/app/src/main/java/com/ages/explorer/AgesSettingsPlugin.java).
// @capacitor/app has no openUrl() in v7 (it moved to @capacitor/app-launcher,
// which is not installed), so the old App.openUrl calls were silent no-ops.
const AgesSettings = registerPlugin('AgesSettings');

/**
 * Open the device Settings screen relevant to location.
 *   kind 'location' -> system Location (device-level) switch on Android
 *   kind 'app'      -> this app's permission page
 * iOS has no public deep link to the global Location Services switch, so both
 * kinds open this app's Settings page (which lists the Location permission).
 *
 * Resolves true if the OS accepted the request, false if it could not be
 * opened (web, or an app build that predates the Android plugin).
 */
export async function openDeviceSettings(kind = 'app') {
  try {
    if (!Capacitor.isNativePlatform()) return false;
    if (Capacitor.getPlatform() === 'ios') {
      // Capacitor's iOS shell hands any non-app top-level URL to
      // UIApplication.open (WebViewDelegationHandler.decidePolicyFor).
      window.location.href = 'app-settings:';
      return true;
    }
    await AgesSettings.openSettings({ kind });
    return true;
  } catch {
    return false;
  }
}