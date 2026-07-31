import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navigation, Heart, BookOpen, Wrench, Settings, Radio, FileText, Image, Video, ClipboardList, Building2, Sparkles, Globe, Square, Play, ArrowRight } from 'lucide-react';
import USMap from '../components/icons/USMap';
import PageContainer from '../components/PageContainer';
import Tombstone from '../components/Tombstone';
import LightningStrike from '../components/LightningStrike';
import NavBar from '../components/NavBar';
import CustomTourModal from '../components/CustomTourModal';
import HauntedLocations from '../components/HauntedLocations';
import { base44 } from '@/api/base44Client';

const menuItems = [
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
  const [tourInProgress, setTourInProgress] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(u => { setUser(u); setTourInProgress(!!u?.last_stop_id); }).catch(() => {});
    base44.entities.Evidence.list('-created_date', 5).then(setEvidences).catch(() => {});
  }, []);

  const handleStopTour = async () => {
    setTourInProgress(false);
    try {
      await base44.auth.updateMe({
        last_tour_id: '',
        last_stop_id: '',
        last_stop_number: 0,
        last_stop_name: '',
        last_tour_title: '',
      });
    } catch (e) {}
  };

  const handleContinueTour = () => {
    if (user?.last_stop_id) navigate(`/stop/${user.last_stop_id}`);
  };

  return (
    <PageContainer>
      <div className="flex flex-col items-center min-h-screen pb-24">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full pt-[max(2.5rem,env(safe-area-inset-top))] pb-4 px-6 text-center"
        >
          <h1 className="font-display text-4xl text-primary tracking-[0.2em] text-3d-pop leading-none">
            EXPLORER
          </h1>
          <p className="mt-2 font-heading text-[11px] tracking-[0.05em] uppercase text-primary font-semibold drop-shadow-[0_0_10px_hsl(199,89%,48%,0.5)] flex items-center justify-center gap-0.5 whitespace-nowrap px-2">
            <span>Discover</span>
            <ArrowRight className="w-3 h-3 text-primary shrink-0" />
            <span>Explore</span>
            <ArrowRight className="w-3 h-3 text-primary shrink-0" />
            <span>Investigate</span>
            <ArrowRight className="w-3 h-3 text-primary shrink-0" />
            <span>Document</span>
            <ArrowRight className="w-3 h-3 text-primary shrink-0" />
            <span>Share</span>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-sm pb-6 px-6"
        >
          <div className="grid grid-cols-2 grid-rows-2 gap-4">
            {/* Top Left: A.G.E.S. */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="flex items-center justify-center pt-12"
            >
              <h1 className="font-display text-5xl text-primary tracking-wider text-3d-pop leading-none">
                AGES
              </h1>
            </motion.div>

            {/* Top Right: Crystal Ball STORE Button */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="flex items-center justify-center"
            >
              <a href="https://www.ebay.com/usr/ages4u" target="_blank" rel="noopener noreferrer" className="relative flex flex-col items-center group focus:outline-none focus-visible:outline-none">
                <div
                  className="w-24 h-24 rounded-full relative overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform duration-300"
                  style={{
                    background: 'radial-gradient(circle at 32% 28%, hsla(199,90%,85%,0.85) 0%, hsla(199,80%,60%,0.35) 14%, hsla(210,60%,30%,0.55) 45%, hsla(268,45%,22%,0.85) 78%, hsla(222,55%,12%,1) 100%)',
                    boxShadow: 'inset 0 0 18px hsla(199,90%,70%,0.45), inset 0 6px 14px hsla(199,90%,90%,0.5), inset 0 -14px 22px hsla(268,50%,10%,0.8)'
                  }}
                >
                  {/* Swirling inner mist */}
                  <motion.div
                    className="absolute inset-0 rounded-full blur-md"
                    style={{ background: 'radial-gradient(ellipse at 60% 65%, hsla(199,90%,60%,0.5) 0%, transparent 55%), radial-gradient(ellipse at 35% 70%, hsla(270,55%,55%,0.4) 0%, transparent 50%)' }}
                    animate={{ rotate: [0, 360], scale: [1, 1.08, 1] }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  {/* Glass specular highlight */}
                  <div
                    className="absolute rounded-full"
                    style={{ top: '10%', left: '16%', width: '34%', height: '26%', background: 'radial-gradient(ellipse at center, hsla(0,0%,100%,0.95) 0%, hsla(199,90%,90%,0.4) 45%, transparent 75%)', filter: 'blur(1px)' }}
                  />
                  <div className="absolute rounded-full bg-white/70" style={{ top: '14%', left: '24%', width: '8%', height: '7%', filter: 'blur(0.5px)' }} />
                  {/* Bottom rim reflection */}
                  <div className="absolute inset-x-3 bottom-1 h-3 rounded-full" style={{ background: 'linear-gradient(to top, hsla(199,90%,75%,0.4), transparent)' }} />
                  {/* Glowing STORE text */}
                  <motion.span
                    animate={{
                      textShadow: ['0 0 10px hsl(199,89%,48%,0.6)', '0 0 20px hsl(199,89%,48%,1)', '0 0 10px hsl(199,89%,48%,0.6)']
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="font-display text-2xl text-primary relative z-10 tracking-widest drop-shadow-[0_0_8px_hsl(199,89%,48%,0.5)]"
                  >
                    STORE
                  </motion.span>
                </div>
                {/* Crystal ball stand — three tiers */}
                <div className="relative flex flex-col items-center -mt-1">
                  <div className="w-8 h-2.5 rounded-b-md" style={{ background: 'linear-gradient(to bottom, hsl(199,42%,48%), hsl(222,42%,22%))', boxShadow: '0 1px 2px hsla(0,0%,0%,0.6)' }} />
                  <div className="w-12 h-2 -mt-px" style={{ background: 'linear-gradient(to bottom, hsl(199,45%,50%), hsl(222,48%,16%))', boxShadow: '0 1px 3px hsla(0,0%,0%,0.55)' }} />
                  <div className="w-16 h-2.5 rounded-md -mt-px" style={{ background: 'linear-gradient(to bottom, hsl(199,45%,52%), hsl(222,50%,14%))', boxShadow: '0 2px 6px hsla(0,0%,0%,0.5)' }} />
                </div>
              </a>
            </motion.div>

            {/* Bottom Left: Acrostic Poem */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="flex items-center justify-center"
            >
              <div className="space-y-1">
                <p className="text-sm font-heading tracking-[0.25em] uppercase text-primary/80">
                  <span className="text-primary font-bold text-lg drop-shadow-[0_0_14px_hsl(199,89%,65%,1)]">A</span>ccessible
                  </p>
                <p className="text-sm font-heading tracking-[0.25em] uppercase text-primary/80">
                  <span className="text-primary font-bold text-lg drop-shadow-[0_0_14px_hsl(199,89%,65%,1)]">G</span>host
                </p>
                <p className="text-sm font-heading tracking-[0.25em] uppercase text-primary/80">
                  <span className="text-primary font-bold text-lg drop-shadow-[0_0_14px_hsl(199,89%,65%,1)]">E</span>xploration
                </p>
                <p className="text-sm font-heading tracking-[0.25em] uppercase text-primary/80">
                  <span className="text-primary font-bold text-lg drop-shadow-[0_0_14px_hsl(199,89%,65%,1)]">S</span>olutions
                </p>
              </div>
            </motion.div>

            {/* Bottom Right: Ghost + Lightning */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.6 }}
              className="flex items-center justify-center relative"
            >
              <Tombstone className="w-28 h-28" />
              <LightningStrike className="top-[-10px] right-[2px]" angle={16} delay={0} />
              <LightningStrike className="top-[-10px] left-[30px]" angle={-30} delay={1.7} width={12} height={30} />
              <LightningStrike className="top-[16px] right-[20px]" angle={24} delay={3.4} width={11} height={24} />
            </motion.div>
          </div>

          <div className="mt-6 w-48 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent mx-auto" />
        </motion.div>

        <motion.div
          className="w-full max-w-sm px-6 mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card/30">
            <Radio className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-[11px] font-heading tracking-widest uppercase text-muted-foreground">
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

        {user && (
          <motion.div
            className="w-full max-w-sm px-6 mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
          >
            <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/40 bg-primary/10">
              <button
                onClick={handleStopTour}
                disabled={!tourInProgress}
                className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-red-500/25 border-2 border-red-500/70 text-red-300 font-heading text-sm uppercase tracking-wider hover:bg-red-500/40 hover:border-red-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-[0_0_16px_hsl(0,72%,51%,0.4)]"
              >
                <Square className="w-4 h-4 fill-current" /> Stop
              </button>
              <div className="flex-1 min-w-0 text-center px-1">
                <p className="font-heading text-xs font-semibold tracking-wide uppercase text-primary">
                  {tourInProgress ? 'Continue Current Tour?' : 'No Tour In Progress'}
                </p>
                {tourInProgress && (
                  <p className="text-[11px] text-foreground/80 mt-0.5 truncate">
                    {user.last_tour_title ? `${user.last_tour_title} · ` : ''}Stop {user.last_stop_number}: {user.last_stop_name}
                  </p>
                )}
              </div>
              <button
                onClick={handleContinueTour}
                disabled={!tourInProgress}
                className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-green-500/25 border-2 border-green-500/70 text-green-300 font-heading text-sm uppercase tracking-wider hover:bg-green-500/40 hover:border-green-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-[0_0_16px_hsl(140,72%,45%,0.4)]"
              >
                Go <Play className="w-4 h-4 fill-current" />
              </button>
            </div>
          </motion.div>
        )}

        <HauntedLocations />

        <motion.div
          className="w-full max-w-sm px-6 grid grid-cols-2 gap-3 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.4 }}
        >
          <Link
            to="/states"
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm hover:border-primary/40 hover:bg-card/60 hover:shadow-[0_0_20px_hsl(199,89%,48%,0.08)] transition-all duration-300 group"
          >
            <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <USMap className="w-6 h-6 text-primary group-hover:drop-shadow-[0_0_8px_hsl(199,89%,48%,0.5)] transition-all" />
            </div>
            <div className="text-center">
              <p className="font-heading text-xs font-semibold tracking-wide uppercase text-foreground">Explore States</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">All 50 U.S. States</p>
            </div>
          </Link>
          <Link
            to="/nearby"
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm hover:border-primary/40 hover:bg-card/60 hover:shadow-[0_0_20px_hsl(199,89%,48%,0.08)] transition-all duration-300 group"
          >
            <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Navigation className="w-6 h-6 text-primary group-hover:drop-shadow-[0_0_8px_hsl(199,89%,48%,0.5)] transition-all" />
            </div>
            <div className="text-center">
              <p className="font-heading text-xs font-semibold tracking-wide uppercase text-foreground">Existing Tours</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Tours Near You</p>
            </div>
          </Link>
        </motion.div>

        <motion.div
          className="w-full max-w-sm px-6 grid grid-cols-2 gap-3 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
        >
          <button
            onClick={() => setShowCustomTour(true)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 hover:shadow-[0_0_24px_hsl(199,89%,48%,0.12)] transition-all duration-300 group"
          >
            <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-heading text-xs font-semibold tracking-wide uppercase text-foreground">Custom Tour</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Bring Visions to Life</p>
            </div>
          </button>
          <Link
            to="/abroad"
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 hover:border-accent/50 hover:shadow-[0_0_24px_hsl(270,40%,42%,0.12)] transition-all duration-300 group"
          >
            <div className="p-2.5 rounded-lg bg-accent/10 group-hover:bg-accent/20 transition-colors">
              <Globe className="w-6 h-6 text-cyan-glow" />
            </div>
            <div className="text-center">
              <p className="font-heading text-xs font-semibold tracking-wide uppercase text-foreground">Tours Abroad</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">International Hauntings</p>
            </div>
          </Link>
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
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
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
              <Link to="/evidence" className="text-[11px] text-primary font-heading uppercase tracking-wider hover:text-primary/80 transition-colors">
                View All →
              </Link>
            </div>
            <div className="space-y-2">
              {evidences.map((e, i) => {
                const Icon = typeIcons[e.type] || FileText;
                return (
                  <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 + i * 0.04 }} className="p-3 rounded-xl border border-border/40 bg-card/40 relative">
                    <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold font-heading flex items-center justify-center shadow-lg">
                      {evidences.length - i}
                    </span>
                    <div className="ml-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-primary/10"><Icon className="w-3.5 h-3.5 text-primary" /></div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{e.title}</p>
                          <p className="text-[11px] text-muted-foreground">{typeLabel[e.type]} {e.location_name ? `• ${e.location_name}` : ''} {e.date ? `• ${e.date}` : ''}</p>
                        </div>
                      </div>
                      {e.description && <p className="text-[11px] text-foreground/60 mt-1.5 leading-relaxed">{e.description}</p>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

      </div>
      <CustomTourModal isOpen={showCustomTour} onClose={() => setShowCustomTour(false)} />
      <NavBar />
    </PageContainer>
  );
}