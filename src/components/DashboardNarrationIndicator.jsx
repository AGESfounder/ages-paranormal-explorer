import React from 'react';
import { useNarrationMode } from '@/hooks/useNarrationMode';
import { canUseEnhanced } from '@/lib/narrationMode';
import NarrationToggle from '@/components/NarrationToggle';

// Explorer+ narration mode indicator. Shows the current narration mode and
// lets Explorer+ users switch between Device and Enhanced. Lower tiers see
// a Device-only indicator (NarrationToggle handles the no-enhance case).
export default function DashboardNarrationIndicator({ user }) {
  const { mode, setMode } = useNarrationMode(user);
  const canEnhance = canUseEnhanced(user);
  return <NarrationToggle mode={mode} setMode={setMode} canEnhance={canEnhance} />;
}