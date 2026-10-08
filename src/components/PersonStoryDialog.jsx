import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Loader2, User, X } from 'lucide-react';
import BePatient from '@/components/BePatient';
import EnergyCostBadge from '@/components/EnergyCostBadge';

// Portal-based dialog (NOT Radix Dialog). Radix Dialog with modal={true}
// (the default) applies `inert` to all sibling elements in the DOM, which
// makes the NarrationAdGate portal — rendered as a sibling to this dialog's
// portal in document.body — completely non-interactive. Using a plain portal
// at z-50 (same as Radix) avoids that inert behavior so the NarrationAdGate
// (z-60) buttons remain clickable when it renders on top of this dialog.
export default function PersonStoryDialog({ person, open, onOpenChange, isGenerating, isSpeaking, onNarrate, narrationMode }) {
  return createPortal(
    <AnimatePresence>
      {open && person && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => onOpenChange?.(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6"
          >
            <button
              onClick={() => onOpenChange?.(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-sky-400" />
              <h2 className="font-heading text-sky-400 uppercase tracking-wide text-base">{person.name}</h2>
            </div>
            <p className="text-log text-sm text-foreground/80 leading-relaxed mb-4">{person.story}</p>
            <button
              onClick={onNarrate}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-400 font-heading text-xs uppercase tracking-wider hover:bg-sky-500/25 transition-colors"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {isGenerating ? <BePatient /> : isSpeaking ? 'Stop' : <>Narrate Story <EnergyCostBadge type="narration" mode={narrationMode} text={person.story} /></>}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}