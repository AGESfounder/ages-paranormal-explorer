import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Map, Navigation, Heart, BookOpen, Wrench, Settings, Zap, Radio, Ghost, FileText, Image, Video, ClipboardList, Building2, Sparkles } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import CustomTourModal from '../components/CustomTourModal';
import { base44 } from '@/api/base44Client';

const menuItems = [
  { label: 'Explore States', icon: Map, path: '/states', desc: 'All 50 U.S. States' },
  { label: 'Nearby Tours', icon: Navigation, path: '/nearby', desc: 'Tours Near You' },
  { label: 'Favorites', icon: Heart, path: '/favorites', desc: 'Saved Tours' },
  { label: 'Evidence Journal', icon: BookOpen, path: '/evidence', desc: 'Your Findings' },
  { label: 'Investigation Toolkit', icon: Wrench, path: '/toolkit', desc: 'Ghost Hunting Tools' },
  { label: 'Settings', icon: Settings, path: '/settings', desc: 'App Preferences' },
];

const typeIcons = { evp: ClipboardList, photo: Image, video: Video, note: FileText };
const typeLabel = { evp: 'Personal Experience', photo: 'Photograph', video: 'Video', note: 'Note' };

export default function Home() {
  const [user, setUser] = useState(null);
  const [evidences, setEvidences] = useState([]);
  const [showCustomTour, setShowCustomTour] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.Evidence.list('-created_date', 5).then(setEvidences).catch(() => {});
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

        <motion.div
          className="w-full max-w-sm px-6 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.4 }}
        >
          <button
            onClick={() => setShowCustomTour(true)}
            className="w-full flex items-center justify-center gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 hover:shadow-[0_0_24px_hsl(199,89%,48%,0.12)] transition-all duration-300 group"
          >
            <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-heading text-sm font-semibold tracking-wide uppercase text-foreground">Custom Tour</p>
              <p className="text-[10px] text-muted-foreground">Haunted Destinations</p>
            </div>
            <Sparkles className="w-4 h-4 text-cyan-glow ml-auto" />
          </button>
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

        {evidences.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="w-full max-w-sm px-6 mt-6"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" /> Recent Evidence
              </h3>
              <Link to="/evidence" className="text-[10px] text-primary font-heading uppercase tracking-wider hover:text-primary/80 transition-colors">
                View All →
              </Link>
            </div>
            <div className="space-y-2">
              {evidences.map((e, i) => {
                const Icon = typeIcons[e.type] || FileText;
                return (
                  <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 + i * 0.04 }} className="p-3 rounded-xl border border-border/40 bg-card/40 relative">
                    <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold font-heading flex items-center justify-center shadow-lg">
                      {evidences.length - i}
                    </span>
                    <div className="ml-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-primary/10"><Icon className="w-3.5 h-3.5 text-primary" /></div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{e.title}</p>
                          <p className="text-[9px] text-muted-foreground">{typeLabel[e.type]} {e.location_name ? `• ${e.location_name}` : ''} {e.date ? `• ${e.date}` : ''}</p>
                        </div>
                      </div>
                      {e.description && <p className="text-[10px] text-foreground/60 mt-1.5 leading-relaxed">{e.description}</p>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8 text-[10px] font-heading tracking-widest uppercase text-muted-foreground/60 text-center px-8"
        >
          Every legend has a story • Every location has a history
        </motion.p>
      </div>
      <CustomTourModal isOpen={showCustomTour} onClose={() => setShowCustomTour(false)} />
      <NavBar />
    </PageContainer>
  );
}