import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Map, Heart, BookOpen, User } from 'lucide-react';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/states', icon: Map, label: 'Explore' },
  { path: '/favorites', icon: Heart, label: 'Favorites' },
  { path: '/evidence', icon: BookOpen, label: 'Journal' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export default function NavBar() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-xl border-t border-border">
      <div className="flex items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link key={item.path} to={item.path} className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-all duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <item.icon className={`w-5 h-5 ${isActive ? 'drop-shadow-[0_0_6px_hsl(199,89%,48%,0.5)]' : ''}`} />
              <span className="text-[10px] font-heading tracking-wider uppercase">{item.label}</span>
              {isActive && <div className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full shadow-[0_0_8px_hsl(199,89%,48%,0.6)]" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}