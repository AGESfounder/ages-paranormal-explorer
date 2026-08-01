import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Wrench, Check } from 'lucide-react';

// All 12 toolkit tools. Standard = first 8 (Explorer+), Premium = last 4 (Investigator+).
const ALL_TOOLS = [
  { name: 'Audio Recorder', desc: 'EVP session recorder with save' },
  { name: 'Radio Sweeper', desc: 'AM/FM frequency sweep for EVP' },
  { name: 'Yes/No/IDK Sweeper', desc: 'Motion-triggered answer sweep + screen record' },
  { name: 'Equipment Guide', desc: 'Ghost hunting equipment guide' },
  { name: 'Weather Monitor', desc: 'Real-time local weather conditions' },
  { name: 'Moon Phase', desc: 'Current moon phase & illumination' },
  { name: 'Paranormal Research: Terms', desc: 'Research database & field manual' },
  { name: 'Safety Protocol', desc: 'Investigation safety guidelines' },
  { name: 'Vibration Communicator', desc: 'Detect energy disturbances via phone sensors', premium: true },
  { name: 'Anomaly Camera', desc: 'Detect human & ghost figures via IR depth scan', premium: true },
  { name: 'Term Sweeper', desc: 'Environment-triggered spirit dictation + screen record', premium: true },
  { name: 'Alphabet Sweeper', desc: 'Sweep A→Z — environment-triggered letter dictation', premium: true },
];

const TIER_TOOL_COUNT = { observer: 0, explorer: 8, investigator: 12, trailblazer: 12 };

export default function TierToolkitAccess({ planId }) {
  const [open, setOpen] = useState(false);
  const count = TIER_TOOL_COUNT[planId] || 0;
  const tools = ALL_TOOLS.slice(0, count);

  return (
    <div className="mt-3 pt-3 border-t border-border/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-2.5 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors min-h-[44px]"
      >
        <span className="flex items-center gap-2 text-xs font-heading uppercase tracking-wider text-primary">
          <Wrench className="w-3.5 h-3.5" /> Toolkit Access
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-xs font-heading ${count === 0 ? 'text-muted-foreground' : 'text-primary'}`}>
            {count} of 12
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {tools.length === 0 ? (
              <p className="text-xs text-muted-foreground/70 py-3 text-center">
                No toolkit access. Upgrade to unlock investigation tools.
              </p>
            ) : (
              <ul className="space-y-1.5 pt-2.5">
                {tools.map((tool, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[11px] font-medium text-foreground">{tool.name}</p>
                      <p className="text-[10px] text-muted-foreground leading-snug">{tool.desc}</p>
                    </div>
                    {tool.premium && (
                      <span className="text-[9px] font-heading uppercase tracking-wider text-accent-foreground/80 shrink-0">Premium</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}