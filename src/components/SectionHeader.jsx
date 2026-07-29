import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GhostFootsteps from './GhostFootsteps';

export default function SectionHeader({ title, subtitle, showBack = false, onBack, rightAction }) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 overflow-hidden">
      <GhostFootsteps />
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {showBack && (
            <button onClick={onBack || (() => navigate(-1))} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="font-heading text-base font-semibold tracking-wide text-foreground uppercase">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {rightAction && <div>{rightAction}</div>}
      </div>
    </div>
  );
}