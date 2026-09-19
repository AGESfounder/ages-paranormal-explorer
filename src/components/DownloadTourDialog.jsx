import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Map, Volume2, X, Loader2, Check, AlertTriangle, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { saveTourOffline } from '@/lib/offlineTours';
import { prefetchTourTiles } from '@/lib/offlineTiles';
import { generateTourAudio, estimateTourNarrationCredits } from '@/lib/offlineAudio';
import { useEnergyGate } from '@/hooks/useEnergyGate';
import { toast } from '@/components/ui/use-toast';
import UpgradePrompt from '@/components/UpgradePrompt';
import BePatient from '@/components/BePatient';

export default function DownloadTourDialog({ tour, stops, open, onClose, onDownloaded }) {
  const [step, setStep] = useState('options'); // 'options' | 'confirm' | 'downloading' | 'done'
  const [selectedLevel, setSelectedLevel] = useState(null); // 'text' | 'full'
  const [progress, setProgress] = useState({ completed: 0, total: 0, label: '' });
  const { user, isPaid, gateNarration, spendNarration, estimateNarrationCost, showUpgrade, setShowUpgrade, gateReason } = useEnergyGate();

  const narrationCredits = useMemo(() => {
    return estimateTourNarrationCredits(tour, stops);
  }, [tour, stops]);

  const userNarrationEnergy = user
    ? (user.narration_energy || 0) + (user.google_trailblazer_narration_energy || 0) + (user.aura_narration_energy || 0)
    : 0;

  const canAffordAudio = user?.role === 'admin' || (isPaid && userNarrationEnergy >= narrationCredits);

  if (!open) return null;

  const handleSelect = (level) => {
    setSelectedLevel(level);
    if (level === 'full') {
      // Check energy gate before showing confirmation
      if (!gateNarration(tour?.introduction || 'x'.repeat(50))) return;
      setStep('confirm');
    } else {
      setStep('confirm');
    }
  };

  const handleConfirm = async () => {
    setStep('downloading');
    setProgress({ completed: 0, total: 0, label: 'Saving tour data…' });

    try {
      // 1. Save tour + stops to localStorage (with download-level metadata)
      const tourWithMeta = {
        ...tour,
        _offline_level: selectedLevel,
        _offline_audio: selectedLevel === 'full',
      };
      const saveResult = saveTourOffline(tourWithMeta, stops);
      if (!saveResult?.ok) {
        toast({ title: 'Download failed', description: saveResult?.message || 'Could not save tour data.', variant: 'destructive' });
        setStep('options');
        return;
      }

      // 2. Prefetch map tiles (free, no credits)
      setProgress({ completed: 0, total: 0, label: 'Caching map tiles…' });
      await prefetchTourTiles(stops, tour, (completed, total) => {
        setProgress({ completed, total, label: `Caching map tiles…` });
      });

      // 3. If full level, generate audio
      if (selectedLevel === 'full') {
        setProgress({ completed: 0, total: 0, label: 'Generating narration audio…' });
        const audioResult = await generateTourAudio(tour, stops, (completed, total, label) => {
          setProgress({ completed, total, label: `Generating: ${label}` });
        });
        // Spend narration credits
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
    if (step === 'downloading') return; // Don't allow closing during download
    setStep('options');
    setSelectedLevel(null);
    onClose();
  };

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
              className="relative w-full max-w-sm bg-card border border-primary/30 rounded-2xl shadow-2xl overflow-hidden"
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
                    onClick={() => handleSelect('text')}
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
                          All tour text, stop details, GPS coordinates, and cached map tiles. Read everything, see the map with stop markers, and view your live GPS position to navigate between stops — all offline.
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1.5">~2-5 MB storage</p>
                      </div>
                    </div>
                  </button>

                  {/* Option 2: Text + Maps + Narration (Credits) */}
                  <button
                    onClick={() => handleSelect('full')}
                    className="w-full text-left p-4 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-accent/15 shrink-0">
                        <Volume2 className="w-5 h-5 text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-heading text-sm font-bold text-foreground">Text + Maps + Narration</h3>
                          <span className="text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground border border-accent/40 flex items-center gap-1">
                            <Zap className="w-3 h-3" /> {narrationCredits} cr
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Everything in Text + Maps, PLUS pre-generated narration audio for the introduction, conclusion, and every stop. Listen to full ghost stories with no service.
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                          ~5-15 MB storage · {narrationCredits} narration credits
                        </p>
                        {!canAffordAudio && (
                          <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> You have {userNarrationEnergy} credits — need {narrationCredits}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {step === 'confirm' && (
                <div className="p-6">
                  <div className="flex justify-center mb-4">
                    <div className="p-3 rounded-full bg-primary/10 border border-primary/30">
                      {selectedLevel === 'full' ? <Volume2 className="w-8 h-8 text-accent-foreground" /> : <Map className="w-8 h-8 text-primary" />}
                    </div>
                  </div>
                  <h2 className="font-heading text-lg font-bold text-foreground text-center mb-2">
                    {selectedLevel === 'full' ? 'Confirm Credit Spend' : 'Confirm Download'}
                  </h2>
                  {selectedLevel === 'full' ? (
                    <>
                      <p className="text-sm text-muted-foreground text-center mb-4 leading-relaxed">
                        This will spend <span className="text-accent-foreground font-bold">{narrationCredits} narration credits</span> to generate offline audio for this tour.
                        <br /><br />
                        You currently have <span className="text-foreground font-bold">{userNarrationEnergy}</span> narration credits remaining.
                      </p>
                      <div className="space-y-2">
                        <button
                          onClick={handleConfirm}
                          className="w-full py-3 rounded-lg bg-accent text-accent-foreground font-heading text-sm uppercase tracking-wider hover:bg-accent/80 transition-colors flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4" /> Yes, Spend {narrationCredits} Credits
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
                        Download <span className="text-foreground font-bold">{tour?.title}</span> for offline use? This includes all tour text, stop details, and cached map tiles — at no cost.
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
                    {selectedLevel === 'full'
                      ? 'Tour text, maps, and narration audio are saved. Find it in the Saved tab on your Favorites page.'
                      : 'Tour text and maps are saved. Find it in the Saved tab on your Favorites page.'}
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