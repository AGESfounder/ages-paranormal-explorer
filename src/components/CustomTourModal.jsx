import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Ghost, MapPin, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { US_STATES } from '../lib/statesData';
import { generateLocationTour, findExistingTour } from '@/lib/generateTour';
import ExistingTourDialog from '@/components/ExistingTourDialog';
import DrawerSelect from '@/components/DrawerSelect';
import TourCategoryPicker from '@/components/TourCategoryPicker';

export default function CustomTourModal({ isOpen, onClose }) {
  const [destination, setDestination] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingTour, setExistingTour] = useState(null);
  const [category, setCategory] = useState('');
  const navigate = useNavigate();

  const handleGenerate = async () => {
    const dest = destination.trim();
    if (!dest || !state) {
      setError('Please fill in both fields.');
      return;
    }
    if (!category) {
      setError('Please select a tour type.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const existing = await findExistingTour(dest, state);
      if (existing) {
        setExistingTour(existing);
        setLoading(false);
        return;
      }
      const newTour = await generateLocationTour(destination, state, undefined, category);
      onClose();
      setDestination('');
      setState('');
      setCategory('');
      navigate(`/tour/${newTour.id}`);
    } catch (err) {
      console.error('Custom tour generation failed', err);
      setError('Failed to generate tour. Please try again.');
    }
    setLoading(false);
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full sm:w-[420px] max-h-[90vh] overflow-y-auto bg-card border border-border/50 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 mx-0 sm:mx-4"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
              disabled={loading}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground">Custom Tour</h2>
                <p className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider">Haunted Destinations</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Haunted Destination
                </label>
                <div className="relative">
                  <Ghost className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="e.g. Pennhurst Asylum"
                    value={destination}
                    onChange={e => setDestination(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  State
                </label>
                <div className="relative">
                  <DrawerSelect icon={MapPin} value={state} onChange={setState} placeholder="Select a state..." options={US_STATES.map(s => ({ value: s.name, label: s.name }))} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Tour Type
                </label>
                <TourCategoryPicker value={category} onChange={setCategory} />
              </div>

              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-[0_0_20px_hsl(199,89%,48%,0.2)]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Your Tour...
                  </>
                ) : (
                  <>
                    <Ghost className="w-4 h-4" />
                    Generate Custom Tour
                  </>
                )}
              </button>

              <p className="text-[10px] text-muted-foreground/60 text-center">
                Choose Landmark for a specific property, Area for a city or town, or Road Trip for a wider driving tour across a region.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <ExistingTourDialog tour={existingTour} onClose={() => setExistingTour(null)} />
    </>
  );
}