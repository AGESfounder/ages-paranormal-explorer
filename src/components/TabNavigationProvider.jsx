import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Bottom-tab roots. Each tab owns an independent navigation stack so that
// switching tabs preserves the sub-route the user was last viewing, and
// tapping the active tab resets it to its root (native app behavior).
const TAB_CONFIG = [
  { key: 'home', path: '/' },
  { key: 'explore', path: '/states' },
  { key: 'community', path: '/community-map' },
  { key: 'journal', path: '/evidence' },
  { key: 'profile', path: '/profile' },
];

// Maps a route to its owning tab key, or null for secondary/deep routes
// (tour detail, stop detail, toolkit, etc.) which are attributed to the
// currently active tab at runtime.
export function pathToTabKey(path) {
  if (path === '/') return 'home';
  if (path === '/states' || path.startsWith('/states/')) return 'explore';
  if (path === '/community-map' || path.startsWith('/community-map/')) return 'community';
  if (path === '/evidence' || path.startsWith('/evidence/')) return 'journal';
  if (path === '/profile' || path.startsWith('/profile/')) return 'profile';
  return null;
}

export function tabRootPath(key) {
  const tab = TAB_CONFIG.find((t) => t.key === key);
  return tab ? tab.path : '/';
}

const TabNavContext = createContext(null);

export function useTabNav() {
  return useContext(TabNavContext);
}

export default function TabNavigationProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const stacksRef = useRef(null);
  if (!stacksRef.current) {
    const init = {};
    TAB_CONFIG.forEach((t) => { init[t.key] = [t.path]; });
    stacksRef.current = init;
  }
  const activeTabRef = useRef('home');
  const [activeTab, setActiveTab] = useState('home');

  // Track location changes: attribute the route to a tab and push it onto
  // that tab's stack (skipping duplicates so root/top entries aren't repeated).
  useEffect(() => {
    const path = location.pathname;
    let tab = pathToTabKey(path);
    if (!tab) tab = activeTabRef.current;
    activeTabRef.current = tab;
    setActiveTab(tab);
    const stack = stacksRef.current[tab];
    if (stack[stack.length - 1] !== path) stack.push(path);
  }, [location.pathname]);

  const switchTab = useCallback((key) => {
    const root = tabRootPath(key);
    if (key === activeTabRef.current) {
      // Tapping the active tab: reset to its root if deeper in the stack.
      const stack = stacksRef.current[key];
      if (stack.length > 1) {
        stacksRef.current[key] = [root];
        navigate(root);
      }
    } else {
      // Switching tabs: jump to the top of the destination tab's stack
      // (preserving its prior sub-route). Pre-set the active tab so any deep
      // route reached there is attributed correctly.
      activeTabRef.current = key;
      setActiveTab(key);
      const stack = stacksRef.current[key];
      const top = stack[stack.length - 1] || root;
      navigate(top);
    }
  }, [navigate]);

  return (
    <TabNavContext.Provider value={{ activeTab, switchTab }}>
      {children}
    </TabNavContext.Provider>
  );
}