import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export default function VerificationBadge({ verified }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 font-heading text-[10px] uppercase tracking-wide font-bold ${
      verified
        ? 'bg-green-500/15 text-green-400 border-b border-green-500/20'
        : 'bg-amber-500/15 text-amber-400 border-b border-amber-500/20'
    }`}>
      {verified ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
      <span className="leading-tight">{verified ? 'Validated — all stops accurately marked!' : 'Not Validated — Be the first to validate all stop locations!'}</span>
    </div>
  );
}