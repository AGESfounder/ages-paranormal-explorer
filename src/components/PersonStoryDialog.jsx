import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Volume2, VolumeX, Loader2, User } from 'lucide-react';

export default function PersonStoryDialog({ person, open, onOpenChange, isGenerating, isSpeaking, onNarrate }) {
  if (!person) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-sky-400 uppercase tracking-wide text-base">
            <User className="w-4 h-4" /> {person.name}
          </DialogTitle>
          <DialogDescription className="sr-only">Notable figure associated with this location</DialogDescription>
        </DialogHeader>
        <p className="text-log text-sm text-foreground/80 leading-relaxed">{person.story}</p>
        <button
          onClick={onNarrate}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-400 font-heading text-xs uppercase tracking-wider hover:bg-sky-500/25 transition-colors"
        >
          {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          {isGenerating ? 'Loading' : isSpeaking ? 'Stop' : 'Narrate Story'}
        </button>
      </DialogContent>
    </Dialog>
  );
}