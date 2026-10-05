import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { getEffectivePlanId } from '@/lib/access';

// Seeker+ ad-free badge. Shows for any tier above Observer.
export default function AdFreeBadge({ user }) {
  const planId = getEffectivePlanId(user);
  if (planId === 'observer') return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-heading uppercase tracking-wider">
      <ShieldCheck className="w-3 h-3" /> Ad-Free
    </span>
  );
}