import React from 'react';
import { Clock } from 'lucide-react';
import { parseToolBanks, AD_GATED_TOOLS, TOOL_DAILY_CAP } from '@/lib/toolAccess';

// Observer tool-banks tile. Shows remaining ad-gated tool time for Observer
// users. Seeker+ is ad-free and never sees this tile.
export default function DashboardToolBanksTile({ user }) {
  const banks = parseToolBanks(user);
  const today = new Date().toISOString().split('T')[0];
  const isToday = user?.tool_banks_date === today;
  const data = isToday ? banks : {};

  return (
    <div className="p-3 rounded-xl border border-border/40 bg-card/30">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-primary" />
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Ad-Gated Tool Time</p>
      </div>
      <div className="space-y-1">
        {AD_GATED_TOOLS.map(tool => {
          const remaining = data[tool]?.r || 0;
          const earned = data[tool]?.e || 0;
          return (
            <div key={tool} className="flex items-center justify-between">
              <span className="text-[11px] text-foreground">{tool}</span>
              <span className="text-[10px] font-mono text-primary">{remaining}s · {earned}/{TOOL_DAILY_CAP}s</span>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground/60 mt-2">Watch a 30s ad for 30s of use. Cap {TOOL_DAILY_CAP}s/day per tool.</p>
    </div>
  );
}