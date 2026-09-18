import React, { createContext, useState, useContext, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { base44, base44ServerUrl } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { identifyRevenueCatUser, resetRevenueCatUser } from '@/lib/revenuecat';

const AuthContext = createContext();

// --- Native iOS OAuth callback helpers --------------------------------------
// The Google/Apple provider flow (base44.auth.loginWithProvider) ends with a
// redirect to the app's own scheme, e.g. capacitor://localhost/?access_token=<token>.
// On native iOS that URL is delivered to the app through the Capacitor App
// plugin (appUrlOpen / getLaunchUrl) instead of reloading the WebView, so the
// token is picked up here and handed to the Base44 client explicitly. Web and
// Android behavior is unchanged: web keeps relying on app-params.js reading
// `access_token` from the query string on a full page load.
const isIosNativePlatform = () => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
};

// Extract the Base44 access token from a callback URL. Returns null when the
// URL carries no token (e.g. an unrelated deep link).
const extractAccessTokenFromUrl = (url) => {
  if (typeof url !== 'string' || !url.includes('access_token=')) return null;
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get('access_token');
    if (fromQuery) return fromQuery;
    if (parsed.hash.includes('access_token=')) {
      return new URLSearchParams(parsed.hash.replace(/^#/, '')).get('access_token');
    }
    return null;
  } catch {
    const match = url.match(/[?&#]access_token=([^&#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
};

// Ensure the token never lingers in the visible WebView URL. It normally
// arrives only via the native event, but clean up if it also landed in
// window.location. Mirrors the cleanup app-params.js does on web.
const removeAccessTokenFromVisibleUrl = () => {
  try {
    const current = new URL(window.location.href);
    if (!current.searchParams.has('access_token')) return;
    current.searchParams.delete('access_token');
    window.history.replaceState({}, document.title, `${current.pathname}${current.search}${current.hash}`);
  } catch { /* ignore */ }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  // Native iOS only: receive the OAuth callback URL
  // (capacitor://localhost/?access_token=...) through Capacitor, store the
  // token on the Base44 client, and refresh auth state. The app is never
  // considered authenticated from Safari's session alone — only from a
  // callback token actually received and stored here.
  useEffect(() => {
    if (!isIosNativePlatform()) return undefined;

    let cancelled = false;
    let listenerHandle;
    let lastHandledUrl = null;
    let handlingInFlight = false;

    const handleAuthCallbackUrl = async (url) => {
      // A cold start can deliver the same URL twice (getLaunchUrl and
      // appUrlOpen); ignore duplicate deliveries and concurrent runs.
      if (!url || url === lastHandledUrl || handlingInFlight) return;
      const token = extractAccessTokenFromUrl(url);
      if (!token) return; // Not an auth callback — leave other deep links alone.
      lastHandledUrl = url;
      handlingInFlight = true;
      try {
        base44.setToken(token);
        appParams.token = token;
        removeAccessTokenFromVisibleUrl();
        await checkUserAuth();
      } catch (error) {
        console.error('Failed to process native auth callback:', error);
      } finally {
        handlingInFlight = false;
      }
    };

    CapacitorApp.addListener('appUrlOpen', (event) => {
      handleAuthCallbackUrl(event?.url);
    }).then((handle) => {
      if (cancelled) handle.remove();
      else listenerHandle = handle;
    }).catch(() => {});

    CapacitorApp.getLaunchUrl()
      .then((launchUrl) => {
        if (launchUrl?.url) handleAuthCallbackUrl(launchUrl.url);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      listenerHandle?.remove();
    };
  }, []);

  const fetchPublicSettings = async (useToken) => {
    const appClient = createAxiosClient({
      // On native, base44ServerUrl is the remote Base44 app origin so this hits
      // https://<app>.base44.app/api/apps/public; on web it is '' and the path
      // stays relative `/api/apps/public` as before.
      baseURL: `${base44ServerUrl}/api/apps/public`,
      headers: {
        'X-App-Id': appParams.appId
      },
      token: useToken ? appParams.token : undefined,
      interceptResponses: true
    });
    return appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
  };

  const clearStoredTokens = () => {
    try {
      localStorage.removeItem('base44_access_token');
      localStorage.removeItem('token');
      localStorage.removeItem('base44_token');
      sessionStorage.removeItem('base44_access_token');
      sessionStorage.removeItem('token');
    } catch (e) { /* ignore */ }
  };

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      try {
        const publicSettings = await fetchPublicSettings(!!appParams.token);
        setAppPublicSettings(publicSettings);

        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        const reason = appError.status === 403 ? appError.data?.extra_data?.reason : null;

        // If the platform rejected a saved token as "user_not_registered", the
        // token is stale/invalid (e.g. an Apple relay-email mismatch). On a
        // PUBLIC app, retrying anonymously should succeed and let the user in.
        // Only retry once; if anonymous also fails, surface the real error.
        if (reason === 'user_not_registered' && appParams.token) {
          console.warn('Stale token rejected — retrying anonymously.');
          clearStoredTokens();
          appParams.token = null;
          try {
            const publicSettings = await fetchPublicSettings(false);
            setAppPublicSettings(publicSettings);
            setIsLoadingAuth(false);
            setIsAuthenticated(false);
            setAuthChecked(true);
            setIsLoadingPublicSettings(false);
            return;
          } catch (retryError) {
            console.error('Anonymous retry also failed:', retryError);
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
            setIsLoadingPublicSettings(false);
            setIsLoadingAuth(false);
            return;
          }
        }

        if (reason === 'auth_required') {
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        } else if (reason === 'user_not_registered') {
          setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
        } else {
          setAuthError({ type: reason || 'unknown', message: appError.message || 'Failed to load app' });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      // Link RevenueCat customer to Base44 user id on native (no-op on web)
      if (currentUser?.id) {
        identifyRevenueCatUser(currentUser.id).catch(() => {});
      }
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    // Clear RevenueCat identity on native; ignore failures
    resetRevenueCatUser().catch(() => {});
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};