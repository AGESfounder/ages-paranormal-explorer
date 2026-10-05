import React, { useState, useEffect, useCallback } from 'react';
import { Volume2, ChevronDown, Play, Square, RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

// Device Voice Picker — lets the user pick which device speechSynthesis
// voice the Device Narration mode uses, plus tune rate/pitch/volume. All
// settings are saved to localStorage and read by speakDevice() in
// useGhostVoice.js. When no voice is selected ("Auto-select"), speakDevice
// falls back to its quality-scored auto-pick.
const VOICE_KEY = 'ages_device_voice_uri';
const SETTINGS_KEY = 'ages_device_voice_settings';

const DEFAULT_SETTINGS = { rate: 0.92, pitch: 0.9, volume: 1.0 };

function qualityLabel(name) {
  const n = (name || '').toLowerCase();
  if (/enhanced|premium/.test(n)) return '★ Enhanced';
  if (/compact|minimal/.test(n)) return 'Compact';
  return '';
}

export default function DeviceVoicePicker() {
  const [voices, setVoices] = useState([]);
  const [selectedURI, setSelectedURI] = useState(() => {
    try { return localStorage.getItem(VOICE_KEY) || ''; } catch { return ''; }
  });
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_SETTINGS;
  });
  const [previewing, setPreviewing] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const loadVoices = () => {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const all = synth.getVoices() || [];
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

  const previewVoice = useCallback(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (previewing) { stopPreview(); return; }
    synth.cancel();
    const voice = selectedURI
      ? voices.find(v => v.voiceURI === selectedURI)
      : voices.find(v => /^en/i.test(v.lang || ''));
    if (!voice && !selectedURI) return;
    const sampleText = 'The spirits walk among us. Listen closely to their whispers.';
    const u = new SpeechSynthesisUtterance(sampleText);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = settings.rate;
    u.pitch = settings.pitch;
    u.volume = settings.volume;
    setPreviewing(true);
    u.onend = () => setPreviewing(false);
    u.onerror = () => setPreviewing(false);
    synth.speak(u);
  }, [voices, selectedURI, settings, previewing, stopPreview]);

  const handleSelect = (uri) => {
    setSelectedURI(uri);
    try {
      if (uri) localStorage.setItem(VOICE_KEY, uri);
      else localStorage.removeItem(VOICE_KEY);
    } catch {}
  };

  const updateSetting = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS)); } catch {}
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
        <div className="mt-3 space-y-3">
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

          {/* Ghostly Voice Tuning */}
          <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-heading text-[10px] uppercase tracking-wider text-primary">Ghostly Tuning</span>
              <button
                onClick={resetSettings}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            {/* Rate */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted-foreground">Speed</label>
                <span className="text-[10px] font-mono text-primary">{settings.rate.toFixed(2)}×</span>
              </div>
              <Slider
                value={[settings.rate]}
                onValueChange={([v]) => updateSetting('rate', v)}
                min={0.5} max={1.5} step={0.01}
                aria-label="Narration speed"
              />
              <p className="text-[9px] text-muted-foreground/60">Slower = more eerie & deliberate</p>
            </div>

            {/* Pitch */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted-foreground">Pitch</label>
                <span className="text-[10px] font-mono text-primary">{settings.pitch.toFixed(2)}</span>
              </div>
              <Slider
                value={[settings.pitch]}
                onValueChange={([v]) => updateSetting('pitch', v)}
                min={0} max={2} step={0.01}
                aria-label="Narration pitch"
              />
              <p className="text-[9px] text-muted-foreground/60">Lower = deeper & more haunting</p>
            </div>

            {/* Volume */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted-foreground">Volume</label>
                <span className="text-[10px] font-mono text-primary">{Math.round(settings.volume * 100)}%</span>
              </div>
              <Slider
                value={[settings.volume]}
                onValueChange={([v]) => updateSetting('volume', v)}
                min={0} max={1} step={0.01}
                aria-label="Narration volume"
              />
              <p className="text-[9px] text-muted-foreground/60">Softer = more distant & whispery</p>
            </div>

          </div>

          <button
            onClick={previewVoice}
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