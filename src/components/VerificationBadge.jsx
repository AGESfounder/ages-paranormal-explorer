import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export default function VerificationBadge({ verified }) {
  return (
    <div className={`grid grid-cols-[auto_1fr] items-center gap-2 px-3 py-1.5 ${
      verified
        ? 'bg-green-500/15 text-green-400 border-b border-green-500/20'
        : 'bg-amber-500/15 text-amber-400 border-b border-amber-500/20'
    }`}>
      <div className="flex flex-col items-center justify-center gap-0.5 font-heading text-[11px] uppercase tracking-wide font-bold text-center leading-none">
        {verified ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Validated</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Not<br/>Validated</span>
          </>
        )}
      </div>
      <span className="text-[11px] leading-tight opacity-80 whitespace-nowrap">{verified ? '— all stops accurately marked!' : '— Be the first to validate all stop locations!'}</span>
    </div>
  );
}