import { createClient } from '@base44/sdk';
import { Capacitor } from '@capacitor/core';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// True when running inside the Capacitor native shell (iOS/Android), where
// relative `/api` URLs would resolve to capacitor://localhost and fail.
const isNativePlatform = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// Base44 API origin passed as `serverUrl`. On native the remote Base44 app
// origin (appBaseUrl, e.g. https://<app>.base44.app) is used with any trailing
// slash removed, so the SDK calls https://<app>.base44.app/api/... . On web it
// stays '' so requests keep using the existing relative `/api` path served
// same-origin / via the dev proxy.
export const base44ServerUrl = (() => {
  if (!isNativePlatform()) return '';
  const origin = typeof appBaseUrl === 'string' ? appBaseUrl.replace(/\/+$/, '') : '';
  if (!origin) {
    console.warn('[base44] VITE_BASE44_APP_BASE_URL is not set; native API requests will fall back to relative /api and fail.');
  }
  return origin;
})();

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: base44ServerUrl,
  requiresAuth: false,
  appBaseUrl
});
