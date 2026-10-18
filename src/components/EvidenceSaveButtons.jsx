import React, { useState } from 'react';
import { Lock, Globe, Loader2, Download, Check } from 'lucide-react';
import { saveBlobToDevice, buildDeviceFilename } from '@/lib/saveToDevice';

/**
 * Save destination picker for evidence.
 * onSave(true)   → Journal Only (private)
 * onSave(false)  → Journal + Community Map (public)
 * deviceBlob     → when provided, a third "Save to Device" button downloads
 *                  the recording locally (no network, no upload) so it can be
 *                  kept during field investigations with poor service and
 *                  uploaded to the Journal later.
 */
export default function EvidenceSaveButtons({ onSave, saving, deviceBlob, devicePrefix }) {
  const [savedToDevice, setSavedToDevice] = useState(false);

  const handleDevice = () => {
    if (!deviceBlob) return;
    saveBlobToDevice(deviceBlob, buildDeviceFilename(devicePrefix || 'evidence', deviceBlob));
    setSavedToDevice(true);
    setTimeout(() => setSavedToDevice(false), 2500);
  };

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
      {deviceBlob && (
        <>
          <button
            onClick={handleDevice}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-heading text-xs uppercase tracking-wider hover:bg-amber-500/20 transition-colors"
          >
            {savedToDevice ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {savedToDevice ? 'Saved to Device' : 'Save to Device'}
          </button>
          <p className="text-[9px] text-muted-foreground/60 text-center leading-relaxed">
            Downloads the recording to your device now — no service needed. Save to your Journal later once you're back in range.
          </p>
        </>
      )}
    </div>
  );
}