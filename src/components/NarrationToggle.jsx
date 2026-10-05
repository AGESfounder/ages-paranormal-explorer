import React from 'react';
import { Smartphone, Sparkles } from 'lucide-react';

// Narration mode toggle — lets users switch between Device (free, client-side
// TTS) and Enhanced (server-side GenerateSpeech, costs narration energy).
//
// For tiers without Enhanced access (Observer/Seeker/Technician), only the
// Device mode indicator is shown — no toggle.
//
// Props:
//   mode: 'device' | 'enhanced' — current narration mode
//   setMode: (mode) => void — change the mode
//   canEnhance: boolean — whether the user can use Enhanced narration
export default function NarrationToggle({ mode, setMode, canEnhance, className = '' }) {
  if (!canEnhance) {
    return (
      <div className={className}>
        <span className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1">Tour Narration</span>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30">
          <Smartphone className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-heading uppercase tracking-wider text-primary">Device Narration</span>
          <span className="text-[9px] text-primary/60 font-mono">Free</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <span className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1">Tour Narration</span>
      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-card/50 border border-border/50">
        <button
          onClick={() => setMode('device')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-heading uppercase tracking-wider transition-colors ${mode === 'device' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Smartphone className="w-3 h-3" />
          Device
          <span className="text-[9px] opacity-60 font-mono">Free</span>
        </button>
        <button
          onClick={() => setMode('enhanced')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-heading uppercase tracking-wider transition-colors ${mode === 'enhanced' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Sparkles className="w-3 h-3" />
          Enhanced
        </button>
      </div>
    </div>
  );
}