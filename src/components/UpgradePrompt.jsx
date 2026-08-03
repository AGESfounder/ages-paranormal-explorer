import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Sparkles, Zap, X } from 'lucide-react';

export default function UpgradePrompt({ show, onClose, reason = 'plan' }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm bg-card border border-primary/30 rounded-2xl shadow-2xl p-6 text-center"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-primary/10 border border-primary/30">
                {reason === 'energy'
                  ? <Zap className="w-8 h-8 text-primary" />
                  : <Sparkles className="w-8 h-8 text-primary" />}
              </div>
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground mb-2">
              {reason === 'energy' ? 'Energy Depleted' : 'Upgrade Required'}
            </h2>
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
              {reason === 'energy'
                ? "You've used all your monthly energy. Buy an Aura Bundle for instant energy, or upgrade your plan for a higher monthly allowance."
                : "This feature requires a paid plan. Upgrade to unlock AI narration, custom tour generation, and the full investigation toolkit."}
            </p>
            <div className="space-y-2">
              <Link
                to="/dashboard"
                onClick={onClose}
                className="block w-full py-3 rounded-lg bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors min-h-[44px] flex items-center justify-center"
              >
                View Plans &amp; Upgrade
              </Link>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-lg border border-border text-muted-foreground text-sm hover:bg-secondary/50 transition-colors min-h-[44px]"
              >
                Maybe Later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}