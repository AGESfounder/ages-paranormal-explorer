import React from 'react';
import { motion } from 'framer-motion';
import { Check, Lock, Sparkles, Crown } from 'lucide-react';
import { PLANS, PLAN_ORDER } from '@/lib/plans';

export default function TierToolsComparison({ currentPlanId }) {
  return (
    <div>
      <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" /> Tools by Tier
      </h3>
      <div className="grid grid-cols-2 gap-2.5">
        {PLAN_ORDER.map((planId, idx) => {
          const plan = PLANS[planId];
          const isCurrent = planId === currentPlanId;
          const isUnlocked = PLAN_ORDER.indexOf(currentPlanId) >= idx;
          const isTrailblazer = planId === 'trailblazer';
          return (
            <motion.div
              key={planId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`p-3 rounded-xl border ${
                isCurrent
                  ? 'border-primary/60 bg-primary/10 shadow-[0_0_16px_hsl(199,89%,48%,0.12)]'
                  : isUnlocked
                    ? 'border-border/40 bg-card/40'
                    : 'border-border/30 bg-card/20 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider border ${plan.badge} flex items-center gap-1`}>
                  {isTrailblazer ? <Crown className="w-3 h-3" /> : null}
                  {plan.name}
                </span>
                {isCurrent ? (
                  <span className="text-[9px] font-heading uppercase tracking-wider text-primary">Current</span>
                ) : isUnlocked ? (
                  <Check className="w-3 h-3 text-green-400" />
                ) : (
                  <Lock className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
              <ul className="space-y-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <Check className={`w-2.5 h-2.5 shrink-0 mt-0.5 ${isUnlocked ? 'text-primary' : 'text-muted-foreground/50'}`} />
                    <span className="text-[10px] text-muted-foreground leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}