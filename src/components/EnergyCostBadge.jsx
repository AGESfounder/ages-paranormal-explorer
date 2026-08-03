import React from 'react';
import { Sparkles, Volume2 } from 'lucide-react';

/**
 * Small cost badge for energy-consuming action buttons.
 * variant="inline" → just "−N" text (for use inside buttons)
 * variant="badge" → pill with icon + "−N" (for standalone use)
 */
export default function EnergyCostBadge({ type = 'narration', cost, text, variant = 'inline', className = '' }) {
  const isManifestation = type === 'manifestation';
  const estimatedCost = isManifestation
    ? (cost || 1)
    : (cost || Math.min(100, Math.max(1, Math.ceil((text || '').length / 50))));

  if (variant === 'inline') {
    return (
      <span className={`ml-0.5 text-[8px] font-mono opacity-50 ${className}`}>
        −{estimatedCost}
      </span>
    );
  }

  const Icon = isManifestation ? Sparkles : Volume2;
  const colorClass = isManifestation
    ? 'text-primary border-primary/20 bg-primary/5'
    : 'text-accent-foreground border-accent/20 bg-accent/5';

  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold ${colorClass} ${className}`}>
      <Icon className="w-2.5 h-2.5" />
      −{estimatedCost}
    </span>
  );
}