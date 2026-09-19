import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Map, Volume2, X, Loader2, Check, AlertTriangle, Zap, ScrollText } from 'lucide-react';
import { saveTourOffline } from '@/lib/offlineTours';
import { prefetchTourTiles } from '@/lib/offlineTiles';
import { generateTourAudio, estimateTourNarrationCredits, clearTourAudio } from '@/lib/offlineAudio';
import { enrichTourStops, countThinStops } from '@/lib/enrichStops';
import { useEnergyGate } from '@/hooks/useEnergyGate';
import { toast } from '@/components/ui/use-toast';
import UpgradePrompt from '@/components/UpgradePrompt';
import BePatient from '@/components/BePatient';

const PAID_LEVELS = [
  { value: 'whisper', label: 'Glimpse into the Past', desc: '⅓ the full story', storage: '~3-8 MB' },
  { value: 'echo', label: 'Uncover the Mystery', desc: '⅔ the full story', storage: '~5-12 MB' },
  { value: 'manifestation', label: 'Relive the Legend', desc: 'The complete story', storage: '~8-20 MB' },
];

export default function DownloadTourDialog({ tour, stops, open, onClose, onDownloaded }) {
  const [step, setStep] = useState('options'); // 'options' | 'confirm' | 'downloading' | 'done'
  const [selectedLevel, setSelectedLevel] = useState(null); // 'free' | 'whisper' | 'echo' | 'manifestation'
  const [progress, setProgress] = useState({ completed: 0, total: 0, label: '' });
  const {
    user, isPaid, manEnergy, auraManEnergy, narEnergy, auraNarEnergy,
    spendNarration, showUpgrade, setShowUpgrade, gateReason, setGateReason,
  } = useEnergyGate();

  const thinStopsCount = useMemo(() => countThinStops(stops), [stops]);

  const creditEstimates = useMemo(() => {
    const estimates = {};
    for (const level of PAID_LEVELS) {
      const enrichmentCost = thinStopsCount;
      const condensationCost = level.value !== 'manifestation' ? 1 : 0;
      const narrationCost = estimateTourNarrationCredits(tour, stops, level.value);
      estimates[level.value] = {
        manifestation: enrichmentCost + condensationCost,
        narration: narrationCost,
      };
    }
    return estimates;
  }, [tour, stops, thinStopsCount]);

  const userManifestationEnergy = user?.role === 'admin' ? Infinity : (manEnergy + auraManEnergy);
  const userNarrationEnergy = user?.role === 'admin' ? Infinity : (narEnergy + auraNarEnergy);

  if (!open) return null;

  const canAfford = (level) => {
    if (level === 'free') return true;
    if (user?.role === 'admin') return true;
    if (!isPaid) return false;
    const credits = creditEstimates[level];
    return userManifestationEnergy >= credits.manifestation && userNarrationEnergy >= credits.narration;
  };

  const handleSelect = (level) => {
    setSelectedLevel(level);
    if (level !== 'free' && !canAfford(level)) {
      setGateReason(isPaid ? 'energy' : 'plan');
      setShowUpgrade(true);
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = async () => {
    setStep('downloading');
    setProgress({ completed: 0, total: 0, label: 'Saving tour data…' });

    try {
      let stopsToSave = stops;

      // 1. Enrich stops (for paid levels — fills in full detail + people)
      if (selectedLevel !== 'free' && thinStopsCount > 0) {
        setProgress({ completed: 0, total: thinStopsCount, label: 'Enriching stop content…' });
        const result = await enrichTourStops(tour, stops, (completed, total, label) => {
          setProgress({ completed, total, label: `Enriching: ${label}` });
        });
        stopsToSave = result.enrichedStops;
      }

      // 2. Save tour + stops to localStorage (with download-level metadata)
      const tourWithMeta = {
        ...tour,
        _offline_level: selectedLevel,
        _offline_audio: selectedLevel !== 'free',
      };
      const saveResult = saveTourOffline(tourWithMeta, stopsToSave);
      if (!saveResult?.ok) {
        toast({ title: 'Download failed', description: saveResult?.message || 'Could not save tour data.', variant: 'destructive' });
        setStep('options');
        return;
      }

      // 3. Prefetch map tiles (free, no credits)
      setProgress({ completed: 0, total: 0, label: 'Caching map tiles…' });
      await prefetchTourTiles(stopsToSave, tour, (completed, total) => {
        setProgress({ completed, total, label: 'Caching map tiles…' });
      });

      // 4. Generate audio (for paid levels — condense text + TTS)
      if (selectedLevel !== 'free') {
        // Clear any previously cached audio so the new level's audio is fresh
        await clearTourAudio(tour.id);
        setProgress({ completed: 0, total: 0, label: 'Generating narration audio…' });
        const audioResult = await generateTourAudio(tour, stopsToSave, (completed, total, label) => {
          setProgress({ completed, total, label: `Generating: ${label}` });
        }, selectedLevel);

        // Spend narration credits
        const narrationCredits = creditEstimates[selectedLevel].narration;
        await spendNarration(narrationCredits);

        if (audioResult.errors > 0) {
          toast({
            title: 'Some audio failed',
            description: `${audioResult.errors} audio segment(s) could not be generated. Text and maps are still saved.`,
          });
        }
      }

      setStep('done');
      if (onDownloaded) onDownloaded();
    } catch (err) {
      console.error('Download error:', err);
      toast({ title: 'Download failed', description: err?.message || 'Please try again.', variant: 'destructive' });
      setStep('options');
    }
  };

  const handleClose = () => {
    if (step === 'downloading') return;
    setStep('options');
    setSelectedLevel(null);
    onClose();
  };

  const selectedCredits = selectedLevel && selectedLevel !== 'free' ? creditEstimates[selectedLevel] : null;
  const selectedLevelInfo = selectedLevel === 'free'
    ? { label: 'Text + Maps', storage: '~2-5 MB' }
    : PAID_LEVELS.find((l) => l.value === selectedLevel);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-sm max-h-[85vh] overflow-y-auto bg-card border border-primary/30 rounded-2xl shadow-2xl"
            >
              <button
                onClick={handleClose}
                disabled={step === 'downloading'}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-30 z-10"
              >
                <X className="w-5 h-5" />
              </button>

              {step === 'options' && (
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Download className="w-5 h-5 text-primary" />
                    <h2 className="font-heading text-lg font-bold text-foreground">Download for Offline</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">{tour?.title}</p>

                  {/* Option 1: Text + Maps (Free) */}
                  <button
                    onClick={() => handleSelect('free')}
                    className="w-full text-left p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors mb-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/15 shrink-0">
                        <Map className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-heading text-sm font-bold text-foreground">Text + Maps</h3>
                          <span className="text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">FREE</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          All tour text, stop summaries, GPS coordinates, and cached map tiles. Read everything, see the map, and navigate — all offline.
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1.5">~2-5 MB storage</p>
                      </div>
                    </div>
                  </button>

                  {/* Paid options: Glimpse, Uncover, Relive */}
                  {PAID_LEVELS.map((level) => {
                    const credits = creditEstimates[level.value];
                    const affordable = canAfford(level.value);
                    return (
                      <button
                        key={level.value}
                        onClick={() => handleSelect(level.value)}
                        className="w-full text-left p-4 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors mb-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-accent/15 shrink-0">
                            <ScrollText className="w-5 h-5 text-accent-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-heading text-sm font-bold text-foreground">{level.label}</h3>
                              <span className="text-[10px] text-muted-foreground">{level.desc}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {level.value === 'manifestation'
                                ? 'Full enriched stop details with complete narration audio. The entire detailed tour, offline.'
                                : `Full enriched stop details condensed to ${level.desc}, plus narration audio at the same length.`}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground border border-accent/40 flex items-center gap-1">
                                <Zap className="w-3 h-3" /> {credits.manifestation} man
                              </span>
                              <span className="text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground border border-accent/40 flex items-center gap-1">
                                <Volume2 className="w-3 h-3" /> {credits.narration} nar
                              </span>
                              <span className="text-[10px] text-muted-foreground/70">{level.storage}</span>
                            </div>
                            {!affordable && (
                              <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {!isPaid ? 'Paid plan required' : 'Insufficient credits'}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 'confirm' && (
                <div className="p-6">
                  <div className="flex justify-center mb-4">
                    <div className="p-3 rounded-full bg-primary/10 border border-primary/30">
                      {selectedLevel === 'free' ? <Map className="w-8 h-8 text-primary" /> : <ScrollText className="w-8 h-8 text-accent-foreground" />}
                    </div>
                  </div>
                  <h2 className="font-heading text-lg font-bold text-foreground text-center mb-2">
                    {selectedLevel === 'free' ? 'Confirm Download' : 'Confirm Credit Spend'}
                  </h2>
                  {selectedLevel === 'free' ? (
                    <>
                      <p className="text-sm text-muted-foreground text-center mb-4 leading-relaxed">
                        Download <span className="text-foreground font-bold">{tour?.title}</span> for offline use? This includes all tour text, stop summaries, and cached map tiles — at no cost.
                      </p>
                      <div className="space-y-2">
                        <button
                          onClick={handleConfirm}
                          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" /> Download Now
                        </button>
                        <button
                          onClick={() => setStep('options')}
                          className="w-full py-2.5 rounded-lg border border-border text-muted-foreground text-sm hover:bg-secondary/50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground text-center mb-4 leading-relaxed">
                        <span className="text-foreground font-bold">{selectedLevelInfo?.label}</span>
                        <br />
                        {thinStopsCount > 0
                          ? `Enriching ${thinStopsCount} stop${thinStopsCount > 1 ? 's' : ''} with full detail, `
                          : ''}
                        {selectedLevel !== 'manifestation' ? 'condensing text, ' : ''}
                        generating narration audio.
                      </p>
                      <div className="space-y-2 mb-4 p-3 rounded-lg bg-secondary/30 border border-border/40">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-accent-foreground" /> Manifestation</span>
                          <span className="text-foreground font-bold">{selectedCredits.manifestation} credits</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1"><Volume2 className="w-3.5 h-3.5 text-accent-foreground" /> Narration</span>
                          <span className="text-foreground font-bold">{selectedCredits.narration} credits</span>
                        </div>
                        <div className="h-px bg-border/40 my-1" />
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Manifestation available</span>
                          <span className={userManifestationEnergy >= selectedCredits.manifestation ? 'text-green-400' : 'text-amber-400'}>
                            {userManifestationEnergy === Infinity ? '∞' : userManifestationEnergy}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Narration available</span>
                          <span className={userNarrationEnergy >= selectedCredits.narration ? 'text-green-400' : 'text-amber-400'}>
                            {userNarrationEnergy === Infinity ? '∞' : userNarrationEnergy}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <button
                          onClick={handleConfirm}
                          className="w-full py-3 rounded-lg bg-accent text-accent-foreground font-heading text-sm uppercase tracking-wider hover:bg-accent/80 transition-colors flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4" /> Confirm &amp; Download
                        </button>
                        <button
                          onClick={() => setStep('options')}
                          className="w-full py-2.5 rounded-lg border border-border text-muted-foreground text-sm hover:bg-secondary/50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {step === 'downloading' && (
                <div className="p-6">
                  <div className="flex justify-center mb-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  </div>
                  <h2 className="font-heading text-lg font-bold text-foreground text-center mb-2">Downloading…</h2>
                  <p className="text-sm text-muted-foreground text-center mb-4">{progress.label}</p>
                  {progress.total > 0 && (
                    <>
                      <div className="w-full bg-secondary/40 rounded-full h-2 overflow-hidden mb-2">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center">{progress.completed} / {progress.total}</p>
                    </>
                  )}
                  <div className="flex justify-center mt-4">
                    <BePatient />
                  </div>
                </div>
              )}

              {step === 'done' && (
                <div className="p-6 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="p-3 rounded-full bg-green-500/15 border border-green-500/30">
                      <Check className="w-8 h-8 text-green-400" />
                    </div>
                  </div>
                  <h2 className="font-heading text-lg font-bold text-foreground mb-2">Saved for Offline!</h2>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {selectedLevel === 'free'
                      ? 'Tour text and maps are saved. Find it in the Saved tab on your Favorites page.'
                      : `${selectedLevelInfo?.label}: full stop details and narration audio are saved. Find it in the Saved tab on your Favorites page.`}
                  </p>
                  <button
                    onClick={handleClose}
                    className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <UpgradePrompt show={showUpgrade} onClose={() => setShowUpgrade(false)} reason={gateReason} />
    </>
  );
}