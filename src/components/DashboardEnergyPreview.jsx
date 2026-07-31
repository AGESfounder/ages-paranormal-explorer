import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Volume2, AlertTriangle } from 'lucide-react';
import { PLANS } from '@/lib/plans';

export default function DashboardEnergyPreview({ user }) {
  const plan = PLANS[user?.plan || 'observer'];
  const isObserver = plan.id === 'observer';

  const manCurrent = (user?.manifestation_energy || 0) + (user?.aura_manifestation_energy || 0);
  const manMax = plan.manifestation_energy + (user?.aura_manifestation_energy || 0);
  const narCurrent = (user?.narration_energy || 0) + (user?.aura_narration_energy || 0);
  const narMax = plan.narration_energy + (user?.aura_narration_energy || 0);

  const manPct = manMax > 0 ? Math.min(100, (manCurrent / manMax) * 100) : 0;
  const narPct = narMax > 0 ? Math.min(100, (narCurrent / narMax) * 100) : 0;

  const lowMan = manPct > 0 && manPct < 20;
  const lowNar = narPct > 0 && narPct < 20;
  const showLowWarning = !isObserver && (lowMan || lowNar);

  return (
    <div className="flex flex-col gap-1.5 shrink-0 min-w-[100px] items-center">
      <span className="text-[11px] font-heading uppercase tracking-wider text-muted-foreground font-semibold">Energy</span>

      {/* Manifestation bar */}
      <div className="flex items-center gap-1.5 w-full">
        <Sparkles className="w-3 h-3 text-primary shrink-0" />
        <div className="flex-1 h-2 rounded-full bg-muted/60 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${isObserver ? 'bg-muted-foreground/40' : lowMan ? 'bg-amber-400' : 'bg-primary'}`}
            initial={{ width: 0 }}
            animate={{ width: `${manPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Narration bar */}
      <div className="flex items-center gap-1.5 w-full">
        <Volume2 className="w-3 h-3 text-accent-foreground shrink-0" />
        <div className="flex-1 h-2 rounded-full bg-muted/60 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${isObserver ? 'bg-muted-foreground/40' : lowNar ? 'bg-amber-400' : 'bg-accent-foreground'}`}
            initial={{ width: 0 }}
            animate={{ width: `${narPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          />
        </div>
      </div>

      {/* Warning or label */}
      {isObserver ? (
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/15 border border-red-500/40"
        >
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span className="text-[10px] font-heading uppercase tracking-wider text-red-400 whitespace-nowrap">
            No Energy
          </span>
        </motion.div>
      ) : showLowWarning ? (
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="flex items-center gap-1"
        >
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-heading uppercase tracking-wider text-amber-400 whitespace-nowrap">
            Low Energy
          </span>
        </motion.div>
      ) : (
        <span className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">
          {plan.name}
        </span>
      )}
    </div>
  );
}