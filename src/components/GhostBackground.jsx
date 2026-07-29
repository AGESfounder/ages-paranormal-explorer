import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GhostFootsteps from './GhostFootsteps';

const CEMETERY_IMG =
  'https://media.base44.com/images/public/6a2dfe40e73c2bacfe73eeb1/37d85f99e_generated_image.png';

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
      {/* Base night gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />

      {/* Foggy moonlit cemetery scene (kept dim so content stays readable) */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: `url(${CEMETERY_IMG})` }}
      />
      {/* Fade the scene into the page background so it reads as atmosphere, not a photo */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background/80" />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, hsla(222,47%,4%,0.85) 100%)' }}
      />

      {/* Drifting fog bands */}
      <motion.div
        className="absolute inset-x-0 top-1/4 h-1/3 blur-xl"
        style={{ background: 'radial-gradient(ellipse at 30% 50%, hsla(200,30%,85%,0.10) 0%, transparent 65%)' }}
        animate={{ x: ['-10%', '15%', '-10%'], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-x-0 top-1/2 h-1/3 blur-2xl"
        style={{ background: 'radial-gradient(ellipse at 70% 50%, hsla(205,25%,80%,0.09) 0%, transparent 70%)' }}
        animate={{ x: ['10%', '-15%', '10%'], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 36, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 h-1/3 blur-xl"
        style={{ background: 'radial-gradient(ellipse at 40% 60%, hsla(195,35%,88%,0.08) 0%, transparent 70%)' }}
        animate={{ x: ['-15%', '10%', '-15%'], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Ambient color glows */}
      <motion.div className="absolute inset-0 opacity-10" animate={{ x: [0, 30, -20, 0], y: [0, -10, 5, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{ background: 'radial-gradient(ellipse at 20% 80%, hsla(199,89%,48%,0.08) 0%, transparent 60%)' }} />
      <motion.div className="absolute inset-0 opacity-10" animate={{ x: [0, -40, 20, 0], y: [0, 15, -8, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        style={{ background: 'radial-gradient(ellipse at 80% 30%, hsla(270,40%,45%,0.08) 0%, transparent 60%)' }} />

      {/* Occasional lightning flash */}
      <AnimatePresence>
        {lightning && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.15 }} exit={{ opacity: 0 }} transition={{ duration: 0.05 }} className="absolute inset-0 bg-cyan-glow" />}
      </AnimatePresence>

      {/* Glowing footsteps across the top */}
      <div className="absolute inset-0">
        <GhostFootsteps />
      </div>
    </div>
  );
}