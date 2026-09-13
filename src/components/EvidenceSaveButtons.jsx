import React from 'react';
import { Lock, Globe, Loader2 } from 'lucide-react';

/**
 * Two-button save destination picker for evidence.
 * onSave(true)  → Journal Only (private)
 * onSave(false) → Journal + Community Map (public)
 */
export default function EvidenceSaveButtons({ onSave, saving }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground text-center">Save Destination</p>
      <button
        onClick={() => onSave(true)}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-xs uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
        {saving ? 'Saving…' : 'Journal Only'}
      </button>
      <button
        onClick={() => onSave(false)}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
        {saving ? 'Saving…' : 'Journal + Community Map'}
      </button>
    </div>
  );
}