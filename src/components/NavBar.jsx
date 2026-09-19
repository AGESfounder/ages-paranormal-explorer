import React from 'react';
import { Home, Map, BookOpen, User, Globe } from 'lucide-react';
import { useTabNav } from '@/components/TabNavigationProvider';

const navItems = [
  { key: 'home', path: '/', icon: Home, label: 'Home' },
  { key: 'explore', path: '/states', icon: Map, label: 'Explore' },
  { key: 'community', path: '/community-map', icon: Globe, label: 'Community' },
  { key: 'journal', path: '/evidence', icon: BookOpen, label: 'Journal' },
  { key: 'profile', path: '/profile', icon: User, label: 'Profile' },
];

export default function NavBar() {
  const { activeTab, switchTab } = useTabNav();

  return (
    // Persistent footer chrome. Stacking contract tier: z-50 (see index.css) —
    // app modals render at z-[60] above it. This bar's rendered height plus the
    // bottom safe area it absorbs below are mirrored by --footer-height /
    // --footer-space in index.css; pages reserve that space via .pb-footer so
    // content is never covered. Keep this bar's height in sync with the token.
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-xl border-t border-border">
      <p className="text-center text-[11px] font-heading tracking-wider uppercase text-primary font-semibold whitespace-nowrap pt-1.5 drop-shadow-[0_0_10px_hsl(199,89%,65%,1)]">
        Explore Past Existence &amp; It's Connection to Today
      </p>
      <div className="flex items-center justify-around px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => switchTab(item.key)}
              aria-label={item.label}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-3 min-h-[44px] min-w-[44px] rounded-lg transition-all duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'drop-shadow-[0_0_6px_hsl(199,89%,48%,0.5)]' : ''}`} />
              <span className="text-[11px] font-heading tracking-wider uppercase">{item.label}</span>
              {isActive && <div className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full shadow-[0_0_8px_hsl(199,89%,48%,0.6)]" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}