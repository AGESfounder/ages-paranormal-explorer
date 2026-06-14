import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Map, Navigation, Heart, BookOpen, Wrench, Settings, Zap, Radio, Ghost } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import { base44 } from '@/api/base44Client';

const menuItems = [
  { label: 'Explore States', icon: Map, path: '/states', desc: 'All 50 U.S. States' },
  { label: 'Nearby Tours', icon: Navigation, path: '/nearby', desc: 'Tours Near You' },
  { label: 'Favorites', icon: Heart, path: '/favorites', desc: 'Saved Tours' },
  { label: 'Evidence Journal', icon: BookOpen, path: '/evidence', desc: 'Your Findings' },
  { label: 'Investigation Toolkit', icon: Wrench, path: '/toolkit', desc: 'Ghost Hunting Tools' },
  { label: 'Settings', icon: Settings, path: '/settings', desc: 'App Preferences' },
];

export default function Home() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  return (
    <PageContainer>
      <div className="flex flex-col items-center min-h-screen pb-24">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center pt-12 pb-6 px-6"
        >
          <div className="relative mb-4">
            <motion.div
              animate={{ 
                filter: ['drop-shadow(0 0 12px hsl(199,89%,48%,0.3))', 'drop-shadow(0 0 24px hsl(199,89%,48%,0.6))', 'drop-shadow(0 0 12px hsl(199,89%,48%,0.3))']
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Ghost className="w-20 h-20 text-primary" />
            </motion.div>
            <motion.div
              className="absolute -top-2 -right-2"
              animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <Zap className="w-6 h-6 text-cyan-glow" />
            </motion.div>
          </div>

          <h1 className="font-display text-5xl text-primary tracking-wider drop-shadow-[0_0_20px_hsl(199,89%,48%,0.4)]">
            A.G.E.S.
          </h1>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="mt-1"
          >
            <p className="font-heading text-[10px] tracking-[0.2em] uppercase text-primary/60 text-center">
              Pronounced "Ages"
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-2"
          >
            <p className="font-heading text-xs tracking-[0.3em] uppercase text-muted-foreground text-center">
              Affordable Ghost Exploration Solutions
            </p>
          </motion.div>
          
          <div className="mt-6 w-48 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        </motion.div>

        <motion.div
          className="w-full max-w-sm px-6 mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card/30">
            <Radio className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-[10px] font-heading tracking-widest uppercase text-muted-foreground">
              Paranormal Scanner Active
            </span>
            <div className="ml-auto flex gap-0.5">
              {[1, 2, 3, 4, 5].map(i => (
                <motion.div
                  key={i}
                  className="w-0.5 bg-primary rounded-full"
                  animate={{ height: [4, 12, 6, 14, 4] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </div>
        </motion.div>

        <div className="w-full max-w-sm px-6 grid grid-cols-2 gap-3">
          {menuItems.map((item, i) => (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
            >
              <Link
                to={item.path}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm hover:border-primary/40 hover:bg-card/60 hover:shadow-[0_0_20px_hsl(199,89%,48%,0.08)] transition-all duration-300 group"
              >
                <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <item.icon className="w-6 h-6 text-primary group-hover:drop-shadow-[0_0_8px_hsl(199,89%,48%,0.5)] transition-all" />
                </div>
                <div className="text-center">
                  <p className="font-heading text-xs font-semibold tracking-wide uppercase text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8 text-[10px] font-heading tracking-widest uppercase text-muted-foreground/60 text-center px-8"
        >
          Every legend has a story • Every location has a history
        </motion.p>
      </div>
      <NavBar />
    </PageContainer>
  );
}