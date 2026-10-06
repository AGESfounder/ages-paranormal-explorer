import React from 'react';
import { Clock, Plus, Loader2 } from 'lucide-react';
import { parseToolBanks, AD_GATED_TOOLS, TOOL_DAILY_CAP } from '@/lib/toolAccess';

// Observer tool-banks tile. Shows remaining ad-gated tool time for Observer
// users and a per-tool "Stock Up" action that watches a rewarded ad to build
// the balance up to the 300s daily cap. Seeker+ is ad-free and never sees this tile.
export default function DashboardToolBanksTile({ user, onStockUp, stockingUp }) {
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
      <div className="space-y-2">
        {AD_GATED_TOOLS.map(tool => {
          const remaining = data[tool]?.r || 0;
          const earned = data[tool]?.e || 0;
          const capped = earned >= TOOL_DAILY_CAP;
          const busy = stockingUp === tool;
          return (
            <div key={tool} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-foreground">{tool}</span>
                <span className="text-[10px] font-mono text-primary">{remaining} / {TOOL_DAILY_CAP}s</span>
              </div>
              <button
                onClick={() => onStockUp && onStockUp(tool)}
                disabled={!onStockUp || busy || capped}
                className="w-full px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors min-h-[36px] flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {capped ? 'Daily cap reached' : busy ? 'Granting…' : 'Stock Up +30s'}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground/60 mt-2">Watch a 30s ad for 30s of use. Cap {TOOL_DAILY_CAP}s/day per tool.</p>
    </div>
  );
}