import React from 'react';
import { Capacitor } from '@capacitor/core';
import { TRIM_OPTIONS } from '@/lib/recordTrim';

// Three pills on the review/stopped screen: Brief (last 30s), Standard (last
// 90s), Full (entire session). Full is the default. The selected option
// determines which chunks are assembled into the saved blob.
//
// Android: the picker is hidden entirely. Brief and Standard both require
// trimming the recording on Android, which fails on live recordings, so an
// Android save is always the entire session — every tool defaults trimMode to
// 'full' and nothing can change it while the picker is hidden. iOS is
// unchanged.
export default function RecordTrimPicker({ value, onChange }) {
  if (Capacitor.getPlatform() === 'android') return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground text-center">Recording Length</p>
      <div className="flex gap-1.5">
        {TRIM_OPTIONS.map((opt) => {
          const isActive = value === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={`flex-1 py-2 rounded-lg text-[10px] font-heading uppercase tracking-wider transition-colors ${
                isActive
                  ? 'bg-primary/20 border border-primary/40 text-primary'
                  : 'bg-card/30 border border-border/40 text-muted-foreground hover:border-primary/30 hover:text-primary'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground/60 text-center">
        {TRIM_OPTIONS.find((o) => o.id === value)?.desc}
      </p>
    </div>
  );
}