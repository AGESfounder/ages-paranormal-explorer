import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext();

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

  const fetchPublicSettings = async (useToken) => {
    const appClient = createAxiosClient({
      baseURL: `/api/apps/public`,
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