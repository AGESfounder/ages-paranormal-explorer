import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Waves, Moon, Volume2, Wrench, Search, BookOpen, Shield, Cloud, Play, Pause, Mic, RefreshCw, Save, Clock, MapPin, ArrowLeft } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';
import ResearchDatabase from '../components/ResearchDatabase';
import useGhostVoice from '../hooks/useGhostVoice';

const tools = [
  { name: 'Audio Recorder', icon: Waves, desc: 'EVP session recorder with save', type: 'recorder' },
  { name: 'Moon Phase', icon: Moon, desc: 'Current moon phase & illumination', type: 'moon' },
  { name: 'Radio Sweeper', icon: Volume2, desc: 'AM/FM frequency sweep for EVP', type: 'audio' },
  { name: 'Weather Monitor', icon: Cloud, desc: 'Real-time local weather conditions', type: 'weather' },
  { name: 'Paranormal Research: Terms', icon: Search, desc: 'Comprehensive research database & field manual', type: 'research' },
  { name: 'Equipment Guide', icon: BookOpen, desc: 'Ghost hunting equipment guide', type: 'guide' },
  { name: 'Safety Protocol', icon: Shield, desc: 'Investigation safety guidelines', type: 'safety' },
  { name: 'Evidence Analyzer', icon: Wrench, desc: 'Review & rate your evidence', type: 'analyzer' },
];

export default function Toolkit() {
  const [activeTool, setActiveTool] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const [savingRec, setSavingRec] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherLocation, setWeatherLocation] = useState('');
  const [guideDetail, setGuideDetail] = useState(null);
  const [radioActive, setRadioActive] = useState(false);
  const [radioFrequency, setRadioFrequency] = useState(530);
  const [radioBand, setRadioBand] = useState('AM');
  const [heardWord, setHeardWord] = useState('');
  const [savedWords, setSavedWords] = useState([]);
  const radioIntervalRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const noiseNodeRef = useRef(null);
  const filterNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const [radioVolume, setRadioVolume] = useState(0.35);
  const { isSpeaking: narrating, isGenerating, narrate, stop: stopNarration } = useGhostVoice();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (radioIntervalRef.current) clearInterval(radioIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      stopRadioAudio();
    };
  }, []);

  useEffect(() => {
    if (activeTool?.type === 'weather') {
      autoFetchWeather();
    }
  }, [activeTool]);

  const stopRadioAudio = () => {
    if (noiseNodeRef.current) {
      try { noiseNodeRef.current.stop(); } catch (e) { /* already stopped */ }
      noiseNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    filterNodeRef.current = null;
    gainNodeRef.current = null;
  };

  const startRadioSweep = async () => {
    stopRadioAudio();
    setRadioActive(true);
    setSavedWords([]);
    setHeardWord('');

    // Auto-start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      setRecording(true);
      setRecordDuration(0);
      setRecordedBlob(null);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied', err);
    }

    // Build audio graph: white noise → lowpass filter → gain → speakers
    // The filter sweeps through the AUDIBLE range (200–6000 Hz) to create
    // the sound of tuning through static, while the display shows radio frequency
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // White noise — the radio static
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // Lowpass filter — sweeps the audible range to change static character
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.value = 300;

    // Master gain
    const gain = ctx.createGain();
    gain.gain.value = radioVolume;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();

    noiseNodeRef.current = noise;
    filterNodeRef.current = filter;
    gainNodeRef.current = gain;

    // Sweep the radio display AND map to audible filter range (200–6000 Hz)
    const amMin = 530, amMax = 1700, fmMin = 88.1, fmMax = 107.9;
    const filterMin = 200, filterMax = 6000;
    let freq = radioBand === 'AM' ? amMin : fmMin;
    let dir = 1;

    radioIntervalRef.current = setInterval(() => {
      const min = radioBand === 'AM' ? amMin : fmMin;
      const max = radioBand === 'AM' ? amMax : fmMax;
      const step = radioBand === 'AM' ? 10 : 0.2;
      freq += step * dir;
      if (freq >= max) { freq = max; dir = -1; }
      if (freq <= min) { freq = min; dir = 1; }

      // Display: radio frequency
      setRadioFrequency(Math.round(freq * 10) / 10);

      // Audio: map radio freq range → audible filter range
      const ratio = (freq - min) / (max - min);
      const audibleFreq = filterMin + ratio * (filterMax - filterMin);
      if (filterNodeRef.current) {
        filterNodeRef.current.frequency.setValueAtTime(audibleFreq, ctx.currentTime);
      }
    }, 200);
  };

  const stopRadioSweep = () => {
    if (radioIntervalRef.current) clearInterval(radioIntervalRef.current);
    radioIntervalRef.current = null;
    stopRadioAudio();
    stopRecording();
    setRadioActive(false);
  };

  const addHeardWord = () => {
    if (!heardWord.trim()) return;
    setSavedWords(prev => [...prev, heardWord.trim()]);
    setHeardWord('');
  };

  const handleGuideNarration = () => {
    narrate(guideDetail);
  };

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordDuration(0);
      setRecordedBlob(null);
      timerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const saveRecording = async () => {
    if (!recordedBlob) return;
    setSavingRec(true);
    try {
      const file = new File([recordedBlob], 'evp_session.webm', { type: 'audio/webm' });
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      const date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      await base44.entities.Evidence.create({
        title: 'EVP Session ' + date,
        type: 'evp',
        description: 'Recorded EVP session — ' + formatDuration(recordDuration),
        file_url: uploadRes.file_url,
        date,
        time,
      });
      setRecordedBlob(null);
      setRecordDuration(0);
    } catch (err) {
      console.error('Save failed', err);
    }
    setSavingRec(false);
  };

  const fetchWeatherByCoords = async (lat, lon) => {
    setWeatherLoading(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Get the current weather conditions for the location at latitude ${lat}, longitude ${lon}. Return temperature in Fahrenheit, humidity %, wind speed and direction, general conditions (e.g. Clear, Cloudy, Rain), and the nearest city/town name. Use current real-time data.`,
        response_json_schema: {
          type: "object",
          properties: {
            temperature: { type: "number" },
            humidity: { type: "number" },
            wind: { type: "string" },
            conditions: { type: "string" },
            location: { type: "string" },
          }
        },
        model: "gemini_3_flash",
        add_context_from_internet: true,
      });
      setWeatherData(res);
    } catch (err) {
      console.error('Weather fetch failed', err);
    }
    setWeatherLoading(false);
  };

  const fetchWeatherByLocation = async () => {
    const loc = weatherLocation.trim();
    if (!loc) return;
    setWeatherLoading(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Get the current weather conditions for "${loc}". Return temperature in Fahrenheit, humidity %, wind speed and direction, and general conditions (e.g. Clear, Cloudy, Rain). Use current real-time data.`,
        response_json_schema: {
          type: "object",
          properties: {
            temperature: { type: "number" },
            humidity: { type: "number" },
            wind: { type: "string" },
            conditions: { type: "string" },
            location: { type: "string" },
          }
        },
        model: "gemini_3_flash",
        add_context_from_internet: true,
      });
      setWeatherData(res);
    } catch (err) {
      console.error('Weather fetch failed', err);
    }
    setWeatherLoading(false);
  };

  const autoFetchWeather = () => {
    if (weatherData) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
        () => { /* fallback to manual */ }
      );
    }
  };

  const renderToolContent = () => {
    if (!activeTool) return null;

    switch (activeTool.type) {
      case 'recorder':
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-black/40 border border-primary/20 min-h-[80px] flex flex-col items-center justify-center gap-2">
              <Mic className={`w-8 h-8 ${recording ? 'text-red-500 animate-pulse' : recordedBlob ? 'text-green-400' : 'text-muted-foreground'}`} />
              <p className="text-xs font-mono text-muted-foreground">
                {recording ? '● Recording... ' + formatDuration(recordDuration) : recordedBlob ? 'Recording complete — ' + formatDuration(recordDuration) : 'Ready to record'}
              </p>
            </div>
            {recording ? (
              <button onClick={stopRecording} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-xs uppercase tracking-wider hover:bg-red-500/20 transition-colors">
                <Pause className="w-3.5 h-3.5" /> Stop Recording
              </button>
            ) : !recordedBlob ? (
              <button onClick={startRecording} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
                <Play className="w-3.5 h-3.5" /> Start Recording
              </button>
            ) : (
              <div className="space-y-2">
                <button onClick={saveRecording} disabled={savingRec} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-xs uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {savingRec ? 'Saving...' : 'Save to Evidence Journal'}
                </button>
                <p className="text-[10px] text-muted-foreground/60 text-center">Saves automatically with date & time</p>
                <button onClick={() => { setRecordedBlob(null); setRecordDuration(0); }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors">
                  <X className="w-3.5 h-3.5" /> Discard
                </button>
              </div>
            )}
          </div>
        );

      case 'moon': {
        const now = new Date();
        const lp = 2551443;
        const newMoon = new Date(2000, 0, 6, 18, 14).getTime() / 1000;
        const phase = ((now.getTime() / 1000 - newMoon) % lp) / lp;
        const phaseNames = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
        const phaseIdx = Math.round(phase * 8) % 8;
        const illumination = Math.round((1 - Math.cos(phase * 2 * Math.PI)) * 50);
        const moonEmojis = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
        return (
          <div className="space-y-4 text-center">
            <div className="text-6xl">{moonEmojis[phaseIdx]}</div>
            <div>
              <p className="font-display text-2xl text-moonlight">{phaseNames[phaseIdx]}</p>
              <p className="text-xs text-muted-foreground mt-1">Best ghost hunting: Full Moon & New Moon nights</p>
              <p className="text-[10px] text-muted-foreground/60 mt-2">Lunar illumination: {illumination}%</p>
            </div>
          </div>
        );
      }

      case 'audio':
        return (
          <div className="space-y-4">
            <div className="flex gap-1.5">
              <button onClick={() => { stopRadioSweep(); setRecordedBlob(null); setRecordDuration(0); setSavedWords([]); setRadioBand('AM'); setRadioFrequency(530); }} className={`flex-1 py-1.5 rounded-lg text-[10px] font-heading uppercase tracking-wider transition-colors ${!radioActive && radioBand === 'AM' ? 'bg-primary/20 border border-primary/40 text-primary' : radioActive && radioBand === 'AM' ? 'bg-primary/20 border border-primary/40 text-primary' : 'bg-card/30 border border-border/40 text-muted-foreground'}`}>
                AM 530–1700 kHz
              </button>
              <button onClick={() => { stopRadioSweep(); setRecordedBlob(null); setRecordDuration(0); setSavedWords([]); setRadioBand('FM'); setRadioFrequency(88.1); }} className={`flex-1 py-1.5 rounded-lg text-[10px] font-heading uppercase tracking-wider transition-colors ${!radioActive && radioBand === 'FM' ? 'bg-primary/20 border border-primary/40 text-primary' : radioActive && radioBand === 'FM' ? 'bg-primary/20 border border-primary/40 text-primary' : 'bg-card/30 border border-border/40 text-muted-foreground'}`}>
                FM 88.1–107.9 MHz
              </button>
            </div>

            <div className="p-4 rounded-lg bg-black/40 border border-primary/20 text-center">
              <p className="font-mono text-3xl text-primary mb-1">
                {radioBand === 'AM' ? radioFrequency.toFixed(0) : radioFrequency.toFixed(1)}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono">
                {radioBand === 'AM' ? 'kHz' : 'MHz'} {radioActive ? '● Sweeping — Recording ' + formatDuration(recordDuration) : '— Standby'}
              </p>
            </div>

            {/* Volume slider */}
            <div>
              <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center justify-between mb-1">
                <span>Volume</span>
                <span className="font-mono text-primary">{Math.round(radioVolume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(radioVolume * 100)}
                onChange={(e) => {
                  const v = parseInt(e.target.value) / 100;
                  setRadioVolume(v);
                  if (gainNodeRef.current) {
                    gainNodeRef.current.gain.value = v;
                  }
                }}
                className="w-full h-1.5 rounded-full bg-secondary appearance-none cursor-pointer accent-primary"
              />
            </div>

            {radioActive ? (
              <button onClick={stopRadioSweep} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-xs uppercase tracking-wider hover:bg-red-500/20 transition-colors">
                <Pause className="w-3.5 h-3.5" /> Stop Sweep
              </button>
            ) : recordedBlob ? (
              <div className="space-y-3">
                {/* Manual word entry — only real words actually heard */}
                <div className="space-y-2">
                  <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Words Heard</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type what you actually heard..."
                      value={heardWord}
                      onChange={e => setHeardWord(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addHeardWord()}
                      className="flex-1 px-3 py-2 rounded-lg bg-card/50 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                    <button onClick={addHeardWord} className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                      Add
                    </button>
                  </div>
                  {savedWords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {savedWords.map((w, i) => (
                        <span key={i} className="px-2 py-1 rounded text-[10px] bg-primary/10 border border-primary/20 text-primary font-mono">
                          {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={saveRecording} disabled={savingRec} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-xs uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {savingRec ? 'Saving...' : 'Save Session to Evidence Journal'}
                </button>
                <p className="text-[10px] text-muted-foreground/60 text-center">{formatDuration(recordDuration)} captured</p>
                <button onClick={() => { setRecordedBlob(null); setRecordDuration(0); setSavedWords([]); }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors">
                  <X className="w-3.5 h-3.5" /> Discard Recording
                </button>
              </div>
            ) : (
              <button onClick={startRadioSweep} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
                <Play className="w-3.5 h-3.5" /> Start Sweep
              </button>
            )}
          </div>
        );

      case 'weather':
        return (
          <div className="space-y-3">
            {weatherLoading && !weatherData ? (
              <div className="p-4 rounded-lg bg-card/30 border border-border/30 text-center">
                <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Fetching your local weather...</p>
              </div>
            ) : weatherData ? (
              <>
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <MapPin className="w-3 h-3" /> {weatherData.location}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Temperature</p>
                    <p className="text-sm font-medium text-foreground">{weatherData.temperature}°F</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Humidity</p>
                    <p className="text-sm font-medium text-foreground">{weatherData.humidity}%</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Wind</p>
                    <p className="text-sm font-medium text-foreground">{weatherData.wind}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Conditions</p>
                    <p className="text-sm font-medium text-foreground">{weatherData.conditions}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-card/30 border border-border/30 text-center">
                <Cloud className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Allow location access for automatic weather</p>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Or search by city..."
                value={weatherLocation}
                onChange={e => setWeatherLocation(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchWeatherByLocation()}
                className="flex-1 px-3 py-2 rounded-lg bg-card/50 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <button onClick={fetchWeatherByLocation} disabled={weatherLoading} className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                {weatherLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {weatherLoading ? '...' : 'Fetch'}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center">Powered by live weather data</p>
          </div>
        );

      case 'research':
        return <ResearchDatabase />;

      case 'guide':
        if (guideDetail) {
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button onClick={() => { stopNarration(); setGuideDetail(null); }} className="flex items-center gap-1.5 text-xs text-primary font-heading uppercase tracking-wider hover:text-primary/80 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Equipment List
                </button>
                <button onClick={handleGuideNarration} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-heading uppercase tracking-wider transition-colors ${narrating ? 'bg-primary/20 border border-primary/40 text-primary' : isGenerating ? 'bg-card/50 border border-border/50 text-muted-foreground' : 'bg-card/50 border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/30'}`}>
                  <Volume2 className={`w-3 h-3 ${narrating || isGenerating ? 'animate-pulse' : ''}`} />
                  {isGenerating ? 'Loading...' : narrating ? 'Stop' : 'Narrate'}
                </button>
              </div>
              <div className="p-4 rounded-lg bg-card/30 border border-border/30 text-xs text-foreground/80 leading-relaxed space-y-3 whitespace-pre-line">
                {guideDetail}
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-2">
            {[
              {
                name: 'REM Device',
                short: 'Radiating Electromagneticity Meters',
                detail: `REM Devices: Radiating Electromagneticity Meters in Ghost Hunting

What Is a REM Device?

A REM (Radiating Electromagneticity Meter) device is a specialized piece of paranormal investigation equipment that measures and detects fluctuations in electromagnetic fields (EMF). Unlike standard EMF meters that simply read ambient electromagnetic levels, REM devices are designed to detect and respond to rapid, radiating bursts of electromagnetic energy — the kind some researchers believe may accompany spirit manifestations.

REM devices often feature multi-axis antenna arrays, audible alarms, and visual displays that react to sudden electromagnetic spikes. Many are purpose-built for paranormal research and tuned to be more sensitive than standard industrial EMF meters.

Scientific Theory

REM devices operate on the principle of electromagnetic induction:
1. An antenna or coil detects changes in the surrounding magnetic field.
2. The device measures both the strength and rate of change of the field.
3. Rapid changes (radiating pulses) trigger visual and audible alerts.
4. The directional antenna can help locate the source of the disturbance.

Unlike passive meters, REM devices actively monitor for spike patterns rather than just ambient levels, making them more responsive to transient electromagnetic events.

Paranormal Theory

Some paranormal researchers theorize that:
• Spirit manifestations may generate brief, localized electromagnetic disturbances.
• The "radiating" nature of REM detection aligns with theories of spirits as energy-based phenomena.
• Correlating REM spikes with other equipment readings (EVP, temperature drops) strengthens evidence.

Best Practices
• Establish baseline readings before investigating.
• Note all nearby electrical sources (wiring, appliances, cell towers).
• Document spikes with timestamps and correlate with other observations.
• Move slowly through spaces to allow the device time to respond.
• A spike on its own is not proof — look for patterns and correlations.`
              },
              {
                name: 'PIR Device',
                short: 'Infrared Motion Sensors',
                detail: `Infrared (IR) Motion Sensors in Ghost Hunting

What Is an Infrared Motion Sensor?

An infrared (IR) motion sensor is a device that detects movement by sensing changes in infrared energy (heat) within its field of view. In ghost hunting, IR motion sensors are often used to alert investigators when something moves through a monitored area, especially in dark environments where visual observation is difficult.

Many paranormal investigators use modified security sensors, driveway alarms, or purpose-built paranormal devices that trigger lights, sounds, or recordings when motion is detected.

Scientific Theory

Most ghost-hunting motion detectors use a Passive Infrared (PIR) Sensor.

A PIR sensor works by:
1. Detecting infrared radiation naturally emitted by warm objects.
2. Monitoring the environment for changes in heat patterns.
3. Triggering an alarm when a heat source moves across different sensing zones.

For example:
• A person walking through a hallway emits body heat.
• The sensor detects the changing heat signature.
• The device activates a light, buzzer, or other alert.

The sensor is "passive" because it does not emit energy; it only receives infrared radiation from its surroundings.

Paranormal Theory

Within paranormal investigation, some researchers theorize that spirits may:
• Manifest as energy fields capable of triggering motion sensors.
• Create localized temperature fluctuations.
• Disturb the infrared field monitored by the sensor.
• Move through a protected detection zone and activate the device.

Some investigators place motion sensors in reportedly active locations such as:
• Hallways
• Staircases
• Doorways
• Historic bedrooms
• Near trigger objects

If the sensor activates without an obvious cause, investigators may attempt communication or correlate the event with other equipment readings.

Limitations and False Triggers

Infrared motion sensors can be triggered by many normal causes, including:
• Investigators moving nearby
• Pets or wildlife
• Insects close to the sensor
• HVAC systems
• Warm air drafts
• Sunlight through windows
• Reflections from heat sources
• Rapid temperature changes

Because of these factors, a motion sensor activation alone is generally not considered strong evidence of paranormal activity.

Best Practices for Ghost Hunting
• Document all people present and their locations.
• Eliminate sources of heat and airflow when possible.
• Use multiple devices to corroborate events.
• Record video of the sensor during investigations.
• Note environmental conditions when activations occur.
• Avoid placing sensors near vents, heaters, or windows.`
              },
              {
                name: 'Thermal Device',
                short: 'Thermal Imaging Camera — Heat Detection',
                detail: `Thermal Imaging Cameras in Ghost Hunting

What Is a Thermal Imaging Camera?

A thermal imaging camera (also called an infrared camera or thermographic camera) detects infrared radiation (heat) and creates an image based on temperature differences. In ghost hunting, thermal cameras are used to detect cold spots, heat signatures, and temperature anomalies that may indicate paranormal activity.

Scientific Theory

Thermal cameras work by detecting infrared radiation in the long-wave infrared spectrum (8–14 μm):
1. All objects above absolute zero emit infrared radiation.
2. The camera's microbolometer sensor absorbs IR radiation and converts it to an electrical signal.
3. Each pixel represents a temperature measurement, rendered as a color on the display.
4. Cooler objects appear blue/purple; warmer objects appear red/yellow/white.

Paranormal Theory

Some investigators theorize that spirit manifestations may:
• Draw thermal energy from the environment, creating cold spots.
• Generate heat as a byproduct of manifestation.
• Appear as human-shaped thermal signatures.
• Create localized temperature anomalies.

Best Practices
• Establish baseline room temperatures before investigating.
• Scan slowly — thermal cameras need time to adjust.
• Note HVAC vents, windows, and other heat sources.
• Document any anomalies with timestamps.
• Correlate cold spots with EMF readings and other equipment.
• A cold spot alone is not proof — look for patterns.`
              },
              {
                name: 'SLS Camera',
                short: 'Structured Light Sensor — Stick Figure Mapping',
                detail: `SLS Cameras (Structured Light Sensor) in Ghost Hunting

What Is an SLS Camera?

An SLS (Structured Light Sensor) camera is a modified device that projects an infrared grid pattern onto a scene and uses a depth sensor (similar to a Microsoft Kinect) to detect and map humanoid shapes. In ghost hunting, SLS cameras are used to detect stick-figure representations of potential apparitions that are invisible to the naked eye.

Scientific Theory

SLS technology works through structured light projection:
1. An infrared projector emits a grid of dots onto the environment.
2. An IR camera reads the distortion of the dot pattern.
3. A processor calculates depth information from the distortion.
4. The software identifies humanoid shapes and renders them as stick figures.

The system is designed to detect humans for gaming and motion tracking — it maps joints, limbs, and body positioning in real time.

Paranormal Theory

Paranormal investigators theorize that spirits may:
• Have a physical form or energy field that the IR grid can detect.
• Distort the structured light pattern in humanoid shapes.
• Appear as stick figures on the SLS display when no living person is present.
• Map to the sensor at unexpected heights, positions, or through solid objects.

Common Observations
• Stick figures appearing in empty rooms.
• Figures mapped at unusual heights (floating or partial).
• Figures appearing through walls or in impossible positions.
• Stick figures that twist or contort unnaturally.

Limitations and False Positives
• The sensor can misinterpret furniture, curtains, or reflections as humanoid shapes.
• Shadows and light patterns can confuse the depth sensor.
• Multiple investigators in range can create overlapping readings.
• The Kinect sensor has a limited range (typically 1.5–4.5 meters).

Best Practices
• Ensure the area is clear of people before scanning.
• Note all furniture, reflective surfaces, and light sources.
• Use in conjunction with other equipment for corroboration.
• Document stick figure readings with screenshots or video.
• A stick figure alone is not proof — cross-reference with EMF, temperature, and audio.`
              },
              {
                name: 'XLS Camera',
                short: 'Extended Light Spectrum — Multi-Spectral Imaging',
                detail: `XLS Cameras (Extended Light Spectrum) in Ghost Hunting

What Is an XLS Camera?

An XLS (Extended Light Spectrum) camera is an advanced imaging device that captures a broader range of the electromagnetic spectrum than standard cameras, combining ultraviolet (UV), visible, and infrared (IR) light capture simultaneously. XLS cameras go beyond full-spectrum modifications by using multiple sensors or filter arrays to capture different spectral bands at once.

Scientific Theory

XLS cameras extend the range of detectable light:
1. Multiple sensors or rotating filter wheels capture UV, visible, and IR bands.
2. Software overlays or composites the different spectral images.
3. The result reveals details invisible to any single spectrum.
4. Some XLS systems capture from 300nm (UV) through 1000nm (near-IR).

Unlike simple full-spectrum conversions, XLS cameras can separate and recombine spectral bands, allowing investigators to isolate phenomena in specific wavelengths.

Paranormal Theory

Investigators believe XLS cameras may capture:
• Spirit energy that manifests in specific spectral bands.
• Apparitions visible only in UV or deep IR.
• Energy fields around haunted locations.
• Multi-spectral anomalies that confirm each other across bands.

Best Practices
• Calibrate the camera in known conditions before investigation.
• Capture the same scene in multiple spectral bands.
• Note all light sources — UV can reveal fluorescent materials, IR reveals heat.
• Use a tripod for multi-spectral captures that require multiple exposures.
• Compare spectral bands side-by-side for anomalies.
• Environmental factors (humidity, dust, smoke) affect all spectral bands differently.`
              },
              {
                name: 'EMF Device',
                short: 'Electromagnetic Field Meter — Energy Detection',
                detail: `EMF Devices (Electromagnetic Field Meters) in Ghost Hunting

What Is an EMF Meter?

An EMF (Electromagnetic Field) meter is a handheld device that measures electromagnetic radiation in the environment. In ghost hunting, EMF meters are one of the most commonly used tools — investigators use them to detect unusual electromagnetic fluctuations that may indicate paranormal activity.

Scientific Theory

EMF meters measure electromagnetic fields produced by:
1. Electrical wiring and appliances (AC fields at 50/60 Hz).
2. Radio waves and wireless communications.
3. Natural sources like the Earth's magnetic field.
4. Static electricity and atmospheric conditions.

Most ghost-hunting EMF meters measure in milligauss (mG) and can detect both AC and DC fields. Standard meters have a single axis; professional meters use tri-axis sensors for directional readings.

Paranormal Theory

The EMF-paranormal connection is one of the most researched areas in ghost hunting:
• Some researchers theorize that spirit manifestations generate measurable electromagnetic fields.
• EMF spikes of 2–7 mG with no identifiable source are considered potentially paranormal.
• High EMF fields may also cause hallucinations, feelings of being watched, and dizziness — potentially explaining some paranormal experiences as environmental effects.
• Correlating EMF spikes with other readings (temperature drops, EVPs) strengthens evidence.

Best Practices
• Establish baseline EMF readings throughout the location before investigating.
• Identify and document ALL electrical sources — wiring, appliances, circuit breakers, cell towers.
• Move slowly — EMF meters need time to register changes.
• Use a tri-axis meter for directional information about the field source.
• Document spikes with exact readings, timestamps, and location.
• High EMF can be caused by faulty wiring — note this for safety as well as evidence.
• A single EMF spike alone is not paranormal evidence — look for patterns and correlations.`
              },
              {
                name: 'Full-Spectrum Camera',
                short: 'UV & IR Light Photography',
                detail: `Full-Spectrum Cameras in Ghost Hunting

What Is a Full-Spectrum Camera?

A full-spectrum camera is a modified digital camera with its internal IR-blocking filter removed, allowing it to capture ultraviolet (UV), visible, and infrared (IR) light simultaneously. In ghost hunting, these cameras are used to document phenomena invisible to the naked eye.

Scientific Theory

Standard digital camera sensors are naturally sensitive to UV, visible, and IR light. Manufacturers install an IR-cut filter to produce normal-looking photos. Removing this filter allows the sensor to capture the full electromagnetic spectrum, revealing:
• Infrared heat signatures from warm objects.
• UV reflections from surfaces and materials.
• Light anomalies that may not be visible to human eyes.

Paranormal Theory

Some investigators believe full-spectrum cameras can capture:
• Orbs and light anomalies associated with spirit energy.
• Apparitions that reflect or emit UV/IR light.
• Energy fields around haunted locations.

Best Practices
• Take baseline photos in normal conditions for comparison.
• Use a tripod for long exposures in dark locations.
• Note all light sources, dust, and reflective surfaces.
• Avoid photographing toward light sources to reduce lens flare.
• Review photos on a large screen for detailed analysis.`
              },
              {
                name: 'Digital Voice Recorder',
                short: 'Audio Capture for EVP Analysis',
                detail: `Digital Voice Recorders in Ghost Hunting

What Is a Digital Voice Recorder?

A portable device that captures high-quality audio recordings for later analysis. Unlike smartphones, dedicated recorders offer better microphone sensitivity, longer battery life, and higher-quality uncompressed audio formats essential for EVP work.

Scientific Theory

Digital recorders sample sound waves at high rates (44.1 kHz or higher) and store them as digital files. Higher bit depths and sample rates capture more detail, making subtle sounds easier to detect during playback analysis.

Paranormal Theory

Investigators use voice recorders to:
• Conduct EVP sessions — asking questions and leaving silence for responses.
• Document environmental sounds during investigations.
• Create a timestamped audio log of events and readings.

Best Practices
• Use an external microphone for better sensitivity.
• Record in WAV or other lossless format when possible.
• Verbally note any normal sounds (cars, footsteps, wind).
• Play back at increased volume with noise-reduction software.
• Never use voice activation — it can cut off beginnings of EVPs.`
              },
            ].map((item, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-card/30 border border-border/30">
                <p className="text-xs font-medium text-foreground">{item.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{item.short}</p>
                <button
                  onClick={() => setGuideDetail(item.detail)}
                  className="mt-2 text-[10px] text-primary font-heading uppercase tracking-wider hover:text-primary/80 transition-colors"
                >
                  View Details →
                </button>
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
                stopRadioAudio();
                setActiveTool(null);
                if (recording) stopRecording();
                if (radioActive) {
                  setRadioActive(false);
                  if (radioIntervalRef.current) clearInterval(radioIntervalRef.current);
                }
                setRecordedBlob(null);
                setSavedWords([]);
                setGuideDetail(null);
                stopNarration();
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