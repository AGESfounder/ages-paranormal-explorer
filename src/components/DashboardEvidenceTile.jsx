import React from 'react';
import { Save } from 'lucide-react';
import { getEffectivePlanId, getSaveEnergy } from '@/lib/access';

// Evidence saves today tile. Shows daily count vs cap (10 for Observer/Seeker,
// 20 for Technician+) and Aura save energy available for Technician+.
export default function DashboardEvidenceTile({ user }) {
  const planId = getEffectivePlanId(user);
  const isAdmin = user?.role === 'admin';
  const today = new Date().toISOString().split('T')[0];
  const isToday = user?.evidence_save_date === today;
  const count = isToday ? (user?.evidence_save_count || 0) : 0;

  const cap = (planId === 'observer' || planId === 'seeker') ? 10 : 20;
  const showAura = planId === 'technician' || planId === 'explorer' || planId === 'investigator' || planId === 'trailblazer' || isAdmin;
  const aura = getSaveEnergy(user);

  return (
    <div className="p-3 rounded-xl border border-border/40 bg-card/30">
      <div className="flex items-center gap-2 mb-2">
        <Save className="w-4 h-4 text-primary" />
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Evidence Saves Today</p>
      </div>
      <p className="font-display text-xl text-foreground">
        {count}<span className="text-sm text-muted-foreground"> / {cap}</span>
      </p>
      {showAura && (
        <p className="text-[10px] text-muted-foreground mt-1">Aura saves: {aura.total}</p>
      )}
    </div>
  );
}