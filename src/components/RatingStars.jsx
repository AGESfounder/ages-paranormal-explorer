import React from 'react';
import { Star } from 'lucide-react';

export default function RatingStars({ value = 0, onChange, max = 5, size = 'md', label }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };

  return (
    <div>
      {label && <p className="text-xs text-muted-foreground mb-1 font-heading uppercase tracking-wide">{label}</p>}
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <button key={i} type="button" onClick={() => onChange?.(i + 1)} className={`transition-all duration-200 ${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}>
            <Star className={`${sizes[size]} ${i < value ? 'fill-primary text-primary drop-shadow-[0_0_4px_hsl(199,89%,48%,0.5)]' : 'text-border'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}