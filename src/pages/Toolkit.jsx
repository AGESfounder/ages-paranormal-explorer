import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Zap, Thermometer, Radio, Waves, Moon, Volume2, Eye, Wrench, Search, BookOpen, Shield, Cloud, Play, Pause, Mic, RefreshCw } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';

const tools = [
  { name: 'EMF Meter', icon: Zap, desc: 'Detect electromagnetic field fluctuations', type: 'emf' },
  { name: 'Thermometer', icon: Thermometer, desc: 'Monitor ambient temperature for cold spots', type: 'thermometer' },
  { name: 'Spirit Box', icon: Radio, desc: 'Simulated radio frequency sweep', type: 'spiritbox' },
  { name: 'Audio Recorder', icon: Waves, desc: 'Simulated EVP session recorder', type: 'recorder' },
  { name: 'Moon Phase', icon: Moon, desc: 'Current moon phase & illumination', type: 'moon' },
  { name: 'Audio Controls', icon: Volume2, desc: 'Narration & background volume', type: 'audio' },
  { name: 'Night Vision', icon: Eye, desc: 'Red filter overlay for low-light', type: 'nightvision' },
  { name: 'Weather Monitor', icon: Cloud, desc: 'Local weather conditions', type: 'weather' },
  { name: 'Research Database', icon: Search, desc: 'Paranormal & historical records', type: 'research' },
  { name: 'Equipment Guide', icon: BookOpen, desc: 'Ghost hunting equipment guide', type: 'guide' },
  { name: 'Safety Protocol', icon: Shield, desc: 'Investigation safety guidelines', type: 'safety' },
  { name: 'Evidence Analyzer', icon: Wrench, desc: 'Review & rate your evidence', type: 'analyzer' },
];

const spiritBoxPhrases = [
  '...cold...here...', '...get out...', '...help me...', '...watching...',
  '...behind you...', '...murder...', '...alone...', '...darkness...',
  '...listen...', '...afraid...', '...buried...', '...never left...',
  'static...', '...who goes there...', '...pain...', '...lost...',
];

export default function Toolkit() {
  const [activeTool, setActiveTool] = useState(null);
  const [emfReading, setEmfReading] = useState(2.3);
  const [temperature, setTemperature] = useState(67);
  const [spiritBoxActive, setSpiritBoxActive] = useState(false);
  const [spiritPhrase, setSpiritPhrase] = useState('');
  const [recording, setRecording] = useState(false);
  const [nightVisionOn, setNightVisionOn] = useState(false);
  const [narrationVolume, setNarrationVolume] = useState(80);
  const [chimeVolume, setChimeVolume] = useState(20);
  const spiritInterval = useRef(null);

  useEffect(() => {
    return () => {
      if (spiritInterval.current) clearInterval(spiritInterval.current);
    };
  }, []);

  const toggleSpiritBox = () => {
    if (spiritBoxActive) {
      clearInterval(spiritInterval.current);
      setSpiritBoxActive(false);
      setSpiritPhrase('');
    } else {
      setSpiritBoxActive(true);
      setSpiritPhrase(spiritBoxPhrases[Math.floor(Math.random() * spiritBoxPhrases.length)]);
      spiritInterval.current = setInterval(() => {
        const r = Math.random();
        if (r < 0.3) {
          setSpiritPhrase('...static...');
        } else {
          setSpiritPhrase(spiritBoxPhrases[Math.floor(Math.random() * spiritBoxPhrases.length)]);
        }
      }, 800 + Math.random() * 1200);
    }
  };

  const refreshEmf = () => setEmfReading(Math.round((Math.random() * 8 + 0.2) * 10) / 10);
  const refreshTemp = () => setTemperature(Math.round(Math.random() * 20 + 55));

  const renderToolContent = () => {
    if (!activeTool) return null;

    switch (activeTool.type) {
      case 'emf':
        return (
          <div className="space-y-4">
            <div className="text-center">
              <p className={`font-display text-5xl mb-1 ${emfReading > 5 ? 'text-red-500 animate-pulse' : emfReading > 3 ? 'text-yellow-400' : 'text-green-400'}`}>{emfReading} mG</p>
              <p className="text-xs text-muted-foreground">
                {emfReading > 5 ? '⚠ HIGH EMF — Possible paranormal activity' : emfReading > 3 ? 'Elevated — worth investigating' : 'Ambient — normal range'}
              </p>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500" animate={{ width: `${Math.min(emfReading * 10, 100)}%` }} transition={{ duration: 0.3 }} />
            </div>
            <button onClick={refreshEmf} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Reading
            </button>
          </div>
        );

      case 'thermometer':
        return (
          <div className="space-y-4">
            <div className="text-center">
              <p className={`font-display text-5xl mb-1 ${temperature < 55 ? 'text-cyan-400 animate-pulse' : temperature < 65 ? 'text-yellow-400' : 'text-foreground'}`}>{temperature}°F</p>
              <p className="text-xs text-muted-foreground">
                {temperature < 55 ? 'Cold spot detected — paranormal indicator' : temperature < 65 ? 'Cool — potential cold spot' : 'Normal ambient temperature'}
              </p>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-red-500" animate={{ width: `${Math.min(temperature * 1.2, 100)}%` }} transition={{ duration: 0.3 }} />
            </div>
            <button onClick={refreshTemp} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Reading
            </button>
          </div>
        );

      case 'spiritbox':
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-black/40 border border-primary/20 min-h-[80px] flex items-center justify-center">
              {spiritBoxActive ? (
                <motion.p
                  key={spiritPhrase}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`font-mono text-sm text-center ${spiritPhrase.includes('static') ? 'text-muted-foreground' : 'text-primary'}`}
                >
                  {spiritPhrase}
                </motion.p>
              ) : (
                <p className="text-xs text-muted-foreground font-mono">Press Start to begin sweep</p>
              )}
            </div>
            <button onClick={toggleSpiritBox} className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-heading text-xs uppercase tracking-wider transition-colors ${spiritBoxActive ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20' : 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20'}`}>
              {spiritBoxActive ? <><Pause className="w-3.5 h-3.5" /> Stop Sweep</> : <><Play className="w-3.5 h-3.5" /> Start Sweep</>}
            </button>
          </div>
        );

      case 'recorder':
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-black/40 border border-primary/20 min-h-[80px] flex flex-col items-center justify-center gap-2">
              <Mic className={`w-8 h-8 ${recording ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}`} />
              <p className="text-xs font-mono text-muted-foreground">
                {recording ? '● Recording... 00:42' : 'Ready to record'}
              </p>
            </div>
            <button onClick={() => setRecording(!recording)} className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-heading text-xs uppercase tracking-wider transition-colors ${recording ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-primary/10 border border-primary/30 text-primary'}`}>
              {recording ? <><Pause className="w-3.5 h-3.5" /> Stop Recording</> : <><Play className="w-3.5 h-3.5" /> Start Recording</>}
            </button>
          </div>
        );

      case 'moon':
        const now = new Date();
        const moonDays = (now.getDate() + (now.getMonth() + 1) * 2) % 29.5;
        const phaseNames = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
        const phaseIdx = Math.floor(moonDays / 3.7) % 8;
        return (
          <div className="space-y-4 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-moonlight shadow-[0_0_30px_hsl(210,30%,90%,0.3)]" />
            <div>
              <p className="font-display text-2xl text-moonlight">{phaseNames[phaseIdx]}</p>
              <p className="text-xs text-muted-foreground mt-1">Best ghost hunting: Full Moon & New Moon nights</p>
              <p className="text-[10px] text-muted-foreground/60 mt-2">Lunar illumination: {Math.round(50 + Math.sin(moonDays / 4.7) * 45)}%</p>
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-heading uppercase tracking-wider text-foreground">Narration Volume</span>
                <span className="text-xs text-muted-foreground">{narrationVolume}%</span>
              </div>
              <input type="range" min="0" max="100" value={narrationVolume} onChange={e => setNarrationVolume(Number(e.target.value))} className="w-full h-2 rounded-full bg-secondary appearance-none cursor-pointer accent-primary" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-heading uppercase tracking-wider text-foreground">Background Chimes</span>
                <span className="text-xs text-muted-foreground">{chimeVolume}%</span>
              </div>
              <input type="range" min="0" max="100" value={chimeVolume} onChange={e => setChimeVolume(Number(e.target.value))} className="w-full h-2 rounded-full bg-secondary appearance-none cursor-pointer accent-primary" />
            </div>
          </div>
        );

      case 'nightvision':
        return (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg min-h-[100px] flex items-center justify-center transition-all ${nightVisionOn ? 'bg-red-950/60 border border-red-500/30' : 'bg-black/40 border border-border/30'}`}>
              <Eye className={`w-10 h-10 ${nightVisionOn ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}`} />
            </div>
            <button onClick={() => setNightVisionOn(!nightVisionOn)} className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-heading text-xs uppercase tracking-wider transition-colors ${nightVisionOn ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-primary/10 border border-primary/30 text-primary'}`}>
              {nightVisionOn ? 'Disable Night Vision' : 'Enable Night Vision'}
            </button>
          </div>
        );

      case 'weather':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Temperature</p>
                <p className="text-sm font-medium text-foreground">62°F</p>
              </div>
              <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Humidity</p>
                <p className="text-sm font-medium text-foreground">74%</p>
              </div>
              <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Wind</p>
                <p className="text-sm font-medium text-foreground">8 mph NW</p>
              </div>
              <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Conditions</p>
                <p className="text-sm font-medium text-foreground">Mostly Clear</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center">Ideal investigation conditions: cool, dry, low wind</p>
          </div>
        );

      case 'research':
        return (
          <div className="space-y-3">
            <input type="text" placeholder="Search locations, events, ghosts..." className="w-full px-3 py-2 rounded-lg bg-card/50 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
            <div className="space-y-2">
              {['Residual Hauntings Explained', 'EVP Classification Guide', 'Historic Haunted Hotels of America', 'Shadow Figures: Theories & Research'].map((item, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-card/30 border border-border/30 hover:border-primary/30 transition-colors cursor-pointer">
                  <p className="text-xs text-foreground">{item}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Research Article</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'guide':
        return (
          <div className="space-y-2">
            {[
              { name: 'EMF Meter', desc: 'Measures electromagnetic fields. Baseline a room first, then watch for spikes of 3+ mG.' },
              { name: 'Digital Thermometer', desc: 'Rapid temperature drops of 10°F+ indicate cold spots — possible spirit manifestation.' },
              { name: 'Spirit Box', desc: 'Sweeps AM/FM frequencies. Spirits manipulate the white noise to form words.' },
              { name: 'Full-Spectrum Camera', desc: 'Captures UV and IR light invisible to the naked eye. Reveals orbs and apparitions.' },
              { name: 'Digital Voice Recorder', desc: 'Record sessions and play back for EVPs (Electronic Voice Phenomena).' },
            ].map((item, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-card/30 border border-border/30">
                <p className="text-xs font-medium text-foreground">{item.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        );

      case 'safety':
        return (
          <div className="space-y-2">
            {[
              'Always investigate in pairs — never alone.',
              'Carry a flashlight with fresh batteries.',
              'Inform someone of your location and expected return time.',
              'Respect private property and obtain permission.',
              'Watch your footing in dark or unfamiliar areas.',
              'Stay hydrated and dress for the weather.',
              'Trust your instincts — if something feels wrong, leave.',
            ].map((rule, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-card/30 border border-border/30">
                <Shield className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground/80 leading-relaxed">{rule}</p>
              </div>
            ))}
          </div>
        );

      case 'analyzer':
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">Rate your evidence to build your investigator profile</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="file" accept="audio/*,image/*,video/*" className="col-span-2 text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs" />
              {['EVP Quality', 'EMF Correlation', 'Visual Clarity', 'Personal Impact'].map(label => (
                <div key={label} className="p-2.5 rounded-lg bg-card/30 border border-border/30">
                  <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
                  <input type="range" min="0" max="10" defaultValue="5" className="w-full h-1.5 rounded-full bg-secondary appearance-none cursor-pointer accent-primary" />
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <PageContainer>
      <SectionHeader title="Investigation Toolkit" subtitle="Ghost Hunting Tools" showBack />
      <div className="px-4 pb-28 pt-3">
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 mb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your paranormal investigation toolkit. Tap any tool to open its interactive interface. Always bring physical equipment as backup.
          </p>
        </div>

        {activeTool ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border border-primary/30 bg-card/40 mb-4"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <activeTool.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-semibold text-foreground">{activeTool.name}</h3>
                  <p className="text-[10px] text-muted-foreground">{activeTool.desc}</p>
                </div>
              </div>
              <button onClick={() => {
                setActiveTool(null);
                if (spiritBoxActive) { clearInterval(spiritInterval.current); setSpiritBoxActive(false); }
                setNightVisionOn(false);
                setRecording(false);
              }} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderToolContent()}
          </motion.div>
        ) : (
          <p className="text-xs text-muted-foreground/60 text-center mb-4">Tap a tool below to open it</p>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {tools.map((tool, i) => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => setActiveTool(tool)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${activeTool?.name === tool.name ? 'border-primary/60 bg-primary/5' : 'border-border/40 bg-card/30 hover:border-primary/30 hover:bg-card/50'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-md ${activeTool?.name === tool.name ? 'bg-primary/20' : 'bg-secondary/30'}`}>
                  <tool.icon className={`w-4 h-4 ${activeTool?.name === tool.name ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-heading uppercase tracking-wider bg-primary/10 text-primary">Tap to Open</span>
              </div>
              <p className="text-xs font-medium text-foreground mb-1">{tool.name}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{tool.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
      <NavBar />
    </PageContainer>
  );
}