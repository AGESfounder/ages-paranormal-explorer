import React, { useState, useEffect, useCallback } from 'react';
import { Volume2, ChevronDown, Play, Square } from 'lucide-react';

// TEST-TOUR ONLY: Lets the user pick which device speechSynthesis voice the
// Eisenhower Farm narration uses. Selection is saved to localStorage and
// read by speakDevice() in useGhostVoice.js. When no voice is selected
// ("Auto-select"), speakDevice falls back to its quality-scored auto-pick.
const STORAGE_KEY = 'ages_device_voice_uri';

function qualityLabel(name) {
  const n = (name || '').toLowerCase();
  if (/enhanced|premium/.test(n)) return '★ Enhanced';
  if (/compact|minimal/.test(n)) return 'Compact';
  return '';
}

export default function DeviceVoicePicker() {
  const [voices, setVoices] = useState([]);
  const [selectedURI, setSelectedURI] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [previewing, setPreviewing] = useState(false);
  const [open, setOpen] = useState(true); // open by default so it's visible on a new device

  useEffect(() => {
    const loadVoices = () => {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const all = synth.getVoices() || [];
      // English voices first, then all others
      const en = all.filter(v => /^en/i.test(v.lang || ''));
      const other = all.filter(v => !/^en/i.test(v.lang || ''));
      setVoices([...en, ...other]);
    };
    loadVoices();
    try { window.speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch {}
    return () => { try { window.speechSynthesis.removeEventListener('voiceschanged', loadVoices); } catch {} };
  }, []);

  const stopPreview = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch {}
    setPreviewing(false);
  }, []);

  const previewVoice = useCallback((uri) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (previewing) { stopPreview(); return; }
    synth.cancel();
    const voice = uri
      ? voices.find(v => v.voiceURI === uri)
      : voices.find(v => /^en/i.test(v.lang || ''));
    if (!voice) return;
    const u = new SpeechSynthesisUtterance('The spirits walk among us. Listen closely to their whispers.');
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.92;
    u.pitch = 0.9;
    setPreviewing(true);
    u.onend = () => setPreviewing(false);
    u.onerror = () => setPreviewing(false);
    synth.speak(u);
  }, [voices, previewing, stopPreview]);

  const handleSelect = (uri) => {
    setSelectedURI(uri);
    try {
      if (uri) localStorage.setItem(STORAGE_KEY, uri);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const selectedVoice = voices.find(v => v.voiceURI === selectedURI);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-primary" />
          <span className="font-heading text-xs uppercase tracking-wider text-primary">Device Voice Picker (Test)</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Pick a voice for this tour's narration. Voices marked ★ Enhanced sound best.
          </p>
          <select
            value={selectedURI}
            onChange={(e) => handleSelect(e.target.value)}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            <option value="">Auto-select (best available)</option>
            {voices.map(v => {
              const q = qualityLabel(v.name);
              const label = `${v.name} — ${v.lang}${q ? ` (${q})` : ''}`;
              return <option key={v.voiceURI} value={v.voiceURI}>{label}</option>;
            })}
          </select>
          <button
            onClick={() => previewVoice(selectedURI)}
            disabled={!voices.length}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/25 transition-colors min-h-[40px] disabled:opacity-50"
          >
            {previewing ? <><Square className="w-3.5 h-3.5" /> Stop Preview</> : <><Play className="w-3.5 h-3.5" /> Preview Voice</>}
          </button>
          {selectedVoice && (
            <p className="text-[10px] text-muted-foreground">
              Selected: {selectedVoice.name} ({selectedVoice.lang})
            </p>
          )}
          <p className="text-[10px] text-orange-400/80">
            Note: Voice availability depends on your device. iOS users can download higher-quality voices in Settings → Accessibility → Spoken Content → Voices.
          </p>
        </div>
      )}
    </div>
  );
}