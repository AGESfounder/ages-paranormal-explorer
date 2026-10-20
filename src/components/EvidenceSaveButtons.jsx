import React, { useEffect, useState } from 'react';
import { Lock, Globe, Loader2, Download, Check, AlertCircle } from 'lucide-react';
import { saveBlobToDevice, buildDeviceFilename } from '@/lib/saveToDevice';
import { Capacitor } from '@capacitor/core';

/**
 * Save destination picker for evidence.
 * onSave(true)   → Journal Only (private)
 * onSave(false)  → Journal + Community Map (public)
 * deviceBlob     → when provided, a third "Save to Device" button saves the
 *                  recording to the device's Photo Library / Gallery (native)
 *                  or downloads it (web) — no network, no upload — so it can
 *                  be kept during field investigations with poor service and
 *                  uploaded to the Journal later.
 */
export default function EvidenceSaveButtons({ onSave, saving, deviceBlob, devicePrefix, preparing = false, preparationError = '' }) {
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [savedToDevice, setSavedToDevice] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const [deviceNote, setDeviceNote] = useState('');
  const blocked = saving || deviceSaving || preparing || !!preparationError;
  useEffect(() => { setSavedToDevice(''); setDeviceNote(''); setDeviceError(''); }, [deviceBlob]);

  const handleDevice = async () => {
    if (!deviceBlob || deviceSaving) return;
    setDeviceSaving(true);
    setDeviceError('');
    try {
      const result = await saveBlobToDevice(deviceBlob, buildDeviceFilename(devicePrefix || 'evidence', deviceBlob));
      const labels = { photos: 'Saved to Photos', gallery: 'Saved to Gallery', files: 'Saved to Files', downloads: 'Download Started' };
      setSavedToDevice(labels[result.destination] || 'Saved to Device');
      setDeviceNote(result.note || labels[result.destination] || 'Saved to Device');
    } catch (e) {
      setDeviceError(e.message || 'Save failed. Please try again.');
    } finally {
      setDeviceSaving(false);
    }
  };

  const nativeLabel = Capacitor.isNativePlatform() ? 'Photos / Gallery / Files' : 'Downloads';

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground text-center">Save Destination</p>
      <button
        onClick={() => onSave(true)}
        disabled={blocked}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-xs uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
        {saving ? 'Saving…' : 'Journal Only'}
      </button>
      <button
        onClick={() => onSave(false)}
        disabled={blocked}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
        {saving ? 'Saving…' : 'Journal + Community Map'}
      </button>
      {deviceBlob && (
        <>
          <button
            onClick={handleDevice}
            disabled={blocked}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-heading text-xs uppercase tracking-wider hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            {deviceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedToDevice ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {deviceSaving ? 'Saving…' : savedToDevice || 'Save to Device'}
          </button>
          {deviceError ? (
            <p className="text-[9px] text-red-400/80 text-center leading-relaxed flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" /> {deviceError}
            </p>
          ) : (
            <p className="text-[9px] text-muted-foreground/60 text-center leading-relaxed">
              {deviceNote || `Saves the recording to your device's ${nativeLabel} now — no service needed. Save to your Journal later once you're back in range.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}