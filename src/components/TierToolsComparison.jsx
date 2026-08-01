import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Wrench, Crown, Lock, Check } from 'lucide-react';
import { PLANS, PLAN_ORDER } from '@/lib/plans';

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

function getToolsForTier(planId) {
  const count = TIER_TOOL_COUNT[planId] || 0;
  return ALL_TOOLS.slice(0, count);
}

export default function TierToolsComparison({ currentPlanId }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div>
      <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
        <Wrench className="w-4 h-4 text-primary" /> Toolkit Access by Tier
      </h3>
      <div className="space-y-2.5">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const count = TIER_TOOL_COUNT[planId];
          const isCurrent = planId === currentPlanId;
          const isUnlocked = PLAN_ORDER.indexOf(currentPlanId) >= PLAN_ORDER.indexOf(planId);
          const isOpen = expanded === planId;
          const tools = getToolsForTier(planId);
          const isTrailblazer = planId === 'trailblazer';

          return (
            <div
              key={planId}
              className={`rounded-xl border ${
                isCurrent ? 'border-primary/60 bg-primary/5' : 'border-border/40 bg-card/30'
              }`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : planId)}
                className="w-full flex items-center justify-between p-3 min-h-[44px]"
              >
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider border ${plan.badge} flex items-center gap-1`}>
                    {isTrailblazer ? <Crown className="w-3 h-3" /> : null}
                    {plan.name}
                  </span>
                  {isCurrent && <span className="text-[9px] font-heading uppercase tracking-wider text-primary">Current</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-heading ${count === 0 ? 'text-muted-foreground' : isUnlocked ? 'text-primary' : 'text-muted-foreground/70'}`}>
                    {count} of 12
                  </span>
                  {isUnlocked ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Lock className="w-3.5 h-3.5 text-muted-foreground/60" />}
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-1 border-t border-border/30">
                      {tools.length === 0 ? (
                        <p className="text-xs text-muted-foreground/70 py-2 text-center">
                          No toolkit access. Upgrade to unlock investigation tools.
                        </p>
                      ) : (
                        <ul className="space-y-1.5 pt-2">
                          {tools.map((tool, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Check className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[11px] font-medium text-foreground">{tool.name}</p>
                                <p className="text-[10px] text-muted-foreground leading-snug">{tool.desc}</p>
                              </div>
                              {tool.premium && (
                                <span className="ml-auto text-[9px] font-heading uppercase tracking-wider text-accent-foreground/80 shrink-0">Premium</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}