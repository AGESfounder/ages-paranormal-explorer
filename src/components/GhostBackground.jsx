import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GhostFootsteps from './GhostFootsteps';

export default function GhostBackground() {
  const [lightning, setLightning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        setLightning(true);
        setTimeout(() => setLightning(false), 150);
        setTimeout(() => { if (Math.random() > 0.5) { setLightning(true); setTimeout(() => setLightning(false), 100); } }, 200);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
      <motion.div className="absolute inset-0 opacity-10" animate={{ x: [0, 30, -20, 0], y: [0, -10, 5, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{ background: 'radial-gradient(ellipse at 20% 80%, hsla(199,89%,48%,0.08) 0%, transparent 60%)' }} />
      <motion.div className="absolute inset-0 opacity-10" animate={{ x: [0, -40, 20, 0], y: [0, 15, -8, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        style={{ background: 'radial-gradient(ellipse at 80% 30%, hsla(270,40%,45%,0.08) 0%, transparent 60%)' }} />
      <AnimatePresence>
        {lightning && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.15 }} exit={{ opacity: 0 }} transition={{ duration: 0.05 }} className="absolute inset-0 bg-cyan-glow" />}
      </AnimatePresence>
      <div className="absolute inset-0">
        <GhostFootsteps />
      </div>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, hsla(222,47%,4%,0.8) 100%)' }} />
    </div>
  );
}