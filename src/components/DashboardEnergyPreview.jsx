import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Volume2, AlertTriangle } from 'lucide-react';
import { PLANS } from '@/lib/plans';

export default function DashboardEnergyPreview({ user }) {
  const plan = PLANS[user?.plan || 'observer'];
  const isObserver = plan.id === 'observer';

  // Observer — flashing "no energy" warning
  if (isObserver) {
    return (
      <div className="flex flex-col gap-1 shrink-0 items-end">
        <span className="text-[9px] font-heading uppercase tracking-wider text-muted-foreground/70">Energy</span>
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/40"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-[10px] font-heading uppercase tracking-wider text-red-400 whitespace-nowrap">
            No Energy
          </span>
        </motion.div>
      </div>
    );
  }

  const manCurrent = (user?.manifestation_energy || 0) + (user?.aura_manifestation_energy || 0);
  const manMax = plan.manifestation_energy + (user?.aura_manifestation_energy || 0);
  const narCurrent = (user?.narration_energy || 0) + (user?.aura_narration_energy || 0);
  const narMax = plan.narration_energy + (user?.aura_narration_energy || 0);

  const manPct = manMax > 0 ? Math.min(100, (manCurrent / manMax) * 100) : 0;
  const narPct = narMax > 0 ? Math.min(100, (narCurrent / narMax) * 100) : 0;

  const lowMan = manPct > 0 && manPct < 20;
  const lowNar = narPct > 0 && narPct < 20;
  const showWarning = lowMan || lowNar;

  return (
    <div className="flex flex-col gap-1.5 shrink-0 min-w-[88px]">
      <span className="text-[9px] font-heading uppercase tracking-wider text-muted-foreground/70 text-right">Energy</span>
      {/* Manifestation bar */}
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-primary shrink-0" />
        <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${lowMan ? 'bg-amber-400' : 'bg-primary'}`}
            initial={{ width: 0 }}
            animate={{ width: `${manPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>
      {/* Narration bar */}
      <div className="flex items-center gap-1.5">
        <Volume2 className="w-3 h-3 text-accent-foreground shrink-0" />
        <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${lowNar ? 'bg-amber-400' : 'bg-accent-foreground'}`}
            initial={{ width: 0 }}
            animate={{ width: `${narPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          />
        </div>
      </div>
      {/* Warning or label */}
      {showWarning ? (
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="flex items-center gap-1"
        >
          <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
          <span className="text-[9px] font-heading uppercase tracking-wider text-amber-400 whitespace-nowrap">
            Low Energy
          </span>
        </motion.div>
      ) : (
        <span className="text-[9px] font-heading uppercase tracking-wider text-muted-foreground text-right">
          {plan.name}
        </span>
      )}
    </div>
  );
}