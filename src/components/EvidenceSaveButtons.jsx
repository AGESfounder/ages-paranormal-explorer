import React, { useEffect, useState } from 'react';
import { Lock, Globe, Loader2, Download, Check, AlertCircle, Copy } from 'lucide-react';
import { saveBlobToDevice, recoverOriginalToDevice, buildDeviceFilename } from '@/lib/saveToDevice';
import { Capacitor } from '@capacitor/core';
import { buildAndroidSaveReport, copySaveReport } from '@/lib/androidSaveDiagnostics';

/**
 * Save destination picker for evidence.
 * onSave(true)   → Journal Only (private)
 * onSave(false)  → Journal + Community Map (public)
 * deviceBlob     → when provided, a third "Save to Device" button saves the
 *                  recording to the device's Photo Library / Gallery (native)
 *                  or downloads it (web) — no network, no upload — so it can
 *                  be kept during field investigations with poor service and
 *                  uploaded to the Journal later.
 * iosAudioOriginalToFiles → Audio Recorder only: on iOS copy the original audio
 *                  directly to Files, without AVFoundation preparation. Local
 *                  save errors do not block its independent Journal actions.
 */
export default function EvidenceSaveButtons({ onSave, saving, deviceBlob, originalBlob = null, devicePrefix, preparing = false, preparationError = '', iosAudioOriginalToFiles = false }) {
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [savedToDevice, setSavedToDevice] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const [deviceNote, setDeviceNote] = useState('');
  const [savePreparationError, setSavePreparationError] = useState('');
  const [copyingDiagnostics, setCopyingDiagnostics] = useState(false);
  const [diagnosticsNote, setDiagnosticsNote] = useState('');
  const isAndroid = Capacitor.getPlatform() === 'android';
  const failedPreparation = preparationError || savePreparationError;
  const directAudioFiles = iosAudioOriginalToFiles && Capacitor.getPlatform() === 'ios';
  const blocked = saving || deviceSaving || preparing || !!preparationError || (!directAudioFiles && !!savePreparationError);
  const canRecover = Capacitor.getPlatform() === 'ios' && originalBlob?.size > 0 && !!failedPreparation;
  useEffect(() => { setSavedToDevice(''); setDeviceNote(''); setDeviceError(''); setSavePreparationError(''); setDiagnosticsNote(''); }, [deviceBlob, originalBlob]);

  const handleCopyDiagnostics = async () => {
    if (copyingDiagnostics) return;
    setCopyingDiagnostics(true);
    setDiagnosticsNote('');
    try {
      const report = await buildAndroidSaveReport(deviceError ? deviceBlob : originalBlob, deviceError || preparationError);
      const copied = await copySaveReport(report);
      setDiagnosticsNote(copied ? 'Diagnostics copied. Share them with the Build 25 tester report.' : 'Could not copy diagnostics. Try Copy save diagnostics again.');
    } catch {
      setDiagnosticsNote('Could not copy diagnostics. Try Copy save diagnostics again.');
    } finally {
      setCopyingDiagnostics(false);
    }
  };

  const handleDevice = async (recover = false) => {
    const input = recover || directAudioFiles ? originalBlob : deviceBlob;
    if (!input || deviceSaving || saving || preparing) return;
    setDeviceSaving(true);
    setDeviceError('');
    setSavedToDevice('');
    setDeviceNote('');
    setDiagnosticsNote('');
    try {
      // Never let an unrecognised audio-only recording enter the video/Photos route.
      if (directAudioFiles && !input.type.startsWith('audio/')) throw new Error('The audio format could not be identified. Your original is kept; you can still save it to your Journal.');
      const filename = buildDeviceFilename(devicePrefix || 'evidence', input, directAudioFiles ? 'bin' : 'webm');
      const result = recover || directAudioFiles ? await recoverOriginalToDevice(originalBlob, filename) : await saveBlobToDevice(deviceBlob, filename);
      const labels = { photos: 'Saved to Photos', gallery: 'Saved to Gallery', files: 'Saved to Files', music: 'Saved to Music', downloads: 'Download Started' };
      setSavedToDevice(labels[result.destination] || 'Saved to Device');
      setDeviceNote(result.note || labels[result.destination] || 'Saved to Device');
      if (!recover) setSavePreparationError('');
    } catch (e) {
      if (e.code === 'recording_preparation_failed') setSavePreparationError(e.message);
      setDeviceError(e.message || 'Save failed. Please try again.');
    } finally {
      setDeviceSaving(false);
    }
  };

  const nativeLabel = directAudioFiles ? 'Files / On My iPhone' : isAndroid ? 'Gallery / Music' : Capacitor.isNativePlatform() ? 'Photos / Gallery / Files' : 'Downloads';

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
            onClick={() => handleDevice()}
            disabled={blocked}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-heading text-xs uppercase tracking-wider hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            {deviceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedToDevice ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {deviceSaving ? 'Saving…' : savedToDevice || (directAudioFiles ? 'Save to Files' : 'Save to Device')}
          </button>
        </>
      )}
      {savePreparationError && (
        <div role="status" className="text-xs text-destructive text-pretty">
          <p>{savePreparationError} Your original is kept until you discard it.</p>
          <button onClick={() => handleDevice()} disabled={saving || deviceSaving || preparing} className="min-h-11 underline focus-visible:outline focus-visible:outline-2 disabled:opacity-50">{directAudioFiles ? 'Retry Files save' : 'Retry preparation'}</button>
        </div>
      )}
      {canRecover && (
        <div className="space-y-2">
          <button onClick={() => handleDevice(true)} disabled={saving || deviceSaving || preparing} className="w-full min-h-11 flex items-center justify-center gap-2 rounded-lg border border-border text-sm hover:bg-accent active:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
            {deviceSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {directAudioFiles ? 'Copy original to Files' : 'Recover original'}
          </button>
          <p className="text-xs text-muted-foreground text-pretty">{directAudioFiles ? 'Copies the unchanged original audio to Files, not Photos. No format conversion is performed.' : 'Retries conversion of the full, untrimmed recording for Photos. If conversion fails, keeps the unchanged original in Files instead, not Photos.'}</p>
        </div>
      )}
      {deviceError ? (
        <p role="alert" className="text-xs text-destructive text-pretty flex items-center justify-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" /> {deviceError}</p>
      ) : (deviceBlob || canRecover) && (
        <p role="status" className="text-xs text-muted-foreground text-center text-pretty">{deviceNote || (directAudioFiles ? 'Copies the unchanged original audio to Files / On My iPhone, not Photos — no conversion or service needed. You can save to your Journal separately.' : `Saves the recording to your device's ${nativeLabel} now — no service needed. Save to your Journal later once you're back in range.`)}</p>
      )}
      {isAndroid && (deviceError || preparationError) && (
        <div className="space-y-1 text-xs">
          <button type="button" onClick={handleCopyDiagnostics} disabled={copyingDiagnostics || deviceSaving || preparing} className="min-h-11 w-full flex items-center justify-center gap-2 rounded-lg border border-border px-3 text-foreground hover:bg-accent active:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
            {copyingDiagnostics ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Copy className="h-4 w-4" />}
            Copy save diagnostics
          </button>
          <p className="text-muted-foreground text-center text-pretty">Copies technical save details only, not your recording or account details.</p>
          {diagnosticsNote && <p role="status" className="text-muted-foreground text-center text-pretty">{diagnosticsNote}</p>}
        </div>
      )}
    </div>
  );
}