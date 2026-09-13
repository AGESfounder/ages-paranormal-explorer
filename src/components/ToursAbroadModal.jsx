import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Globe, Ghost, MapPin, Building2, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DrawerSelect from '@/components/DrawerSelect';
import { generateLocationTour, findExistingTour } from '@/lib/generateTour';
import ExistingTourDialog from '@/components/ExistingTourDialog';
import { useEnergyGate } from '@/hooks/useEnergyGate';
import UpgradePrompt from '@/components/UpgradePrompt';
import EnergyCostBadge from '@/components/EnergyCostBadge';

const LOCATION_OPTIONS = [
  { value: 'England', label: 'England' },
  { value: 'Scotland', label: 'Scotland' },
  { value: 'Ireland', label: 'Ireland' },
  { value: 'Wales', label: 'Wales' },
  { value: 'France', label: 'France' },
  { value: 'Germany', label: 'Germany' },
  { value: 'Italy', label: 'Italy' },
  { value: 'Spain', label: 'Spain' },
  { value: 'Portugal', label: 'Portugal' },
  { value: 'Netherlands', label: 'Netherlands' },
  { value: 'Belgium', label: 'Belgium' },
  { value: 'Switzerland', label: 'Switzerland' },
  { value: 'Austria', label: 'Austria' },
  { value: 'Czech Republic', label: 'Czech Republic' },
  { value: 'Poland', label: 'Poland' },
  { value: 'Romania', label: 'Romania' },
  { value: 'Greece', label: 'Greece' },
  { value: 'Turkey', label: 'Turkey' },
  { value: 'Sweden', label: 'Sweden' },
  { value: 'Norway', label: 'Norway' },
  { value: 'Denmark', label: 'Denmark' },
  { value: 'Finland', label: 'Finland' },
  { value: 'Iceland', label: 'Iceland' },
  { value: 'Russia', label: 'Russia' },
  { value: 'Japan', label: 'Japan' },
  { value: 'China', label: 'China' },
  { value: 'India', label: 'India' },
  { value: 'Thailand', label: 'Thailand' },
  { value: 'South Korea', label: 'South Korea' },
  { value: 'Vietnam', label: 'Vietnam' },
  { value: 'Philippines', label: 'Philippines' },
  { value: 'Indonesia', label: 'Indonesia' },
  { value: 'Australia', label: 'Australia' },
  { value: 'New Zealand', label: 'New Zealand' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Mexico', label: 'Mexico' },
  { value: 'Brazil', label: 'Brazil' },
  { value: 'Argentina', label: 'Argentina' },
  { value: 'Peru', label: 'Peru' },
  { value: 'Chile', label: 'Chile' },
  { value: 'Colombia', label: 'Colombia' },
  { value: 'Egypt', label: 'Egypt' },
  { value: 'Morocco', label: 'Morocco' },
  { value: 'South Africa', label: 'South Africa' },
  { value: 'Kenya', label: 'Kenya' },
  { value: 'United Arab Emirates', label: 'United Arab Emirates' },
  { value: 'Israel', label: 'Israel' },
  { value: 'Saudi Arabia', label: 'Saudi Arabia' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'Malaysia', label: 'Malaysia' },
  { value: 'Caribbean Sea', label: 'Caribbean Sea' },
  { value: 'Mediterranean Sea', label: 'Mediterranean Sea' },
  { value: 'North Atlantic', label: 'North Atlantic' },
  { value: 'Pacific Ocean', label: 'Pacific Ocean' },
  { value: 'Indian Ocean', label: 'Indian Ocean' },
];

const TYPE_OPTIONS = [
  { value: 'Island', label: 'Island' },
  { value: 'Ship', label: 'Ship' },
  { value: 'Territory', label: 'Territory' },
  { value: 'N/A', label: 'N/A' },
];

const STOP_OPTIONS = [
  { value: '3-4', label: '3–4 stops' },
  { value: '5-7', label: '5–7 stops' },
  { value: '8-10', label: '8–10 stops' },
];

export default function ToursAbroadModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { gateManifestation, spendManifestation, showUpgrade, setShowUpgrade, gateReason } = useEnergyGate();
  const [destinationName, setDestinationName] = useState('');
  const [location, setLocation] = useState('');
  const [locationType, setLocationType] = useState('');
  const [stopCount, setStopCount] = useState('5-7');
  const [specifics, setSpecifics] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingTour, setExistingTour] = useState(null);

  const handleGenerate = async () => {
    const dest = destinationName.trim();
    const loc = location.trim();
    const locType = locationType.trim();
    if (!dest || !loc || !locType) {
      setError('Please fill in all fields.');
      return;
    }
    if (!gateManifestation()) return;
    setError('');
    setLoading(true);

    try {
      const category = locType === 'Ship' ? 'ship' : 'landmark';
      const specificLocations = specifics.trim() || undefined;

      // Check for an existing tour first — same dedup rules as domestic tours
      const existing = await findExistingTour(dest, loc, category, 'exterior_interior', undefined, specificLocations);
      if (existing) {
        setExistingTour(existing);
        setLoading(false);
        return;
      }

      // Use the SAME unified pipeline as Custom Tour — gets dedup, verified
      // coordinate reuse, route optimization, and fix-collapsed-coords for free
      const newTour = await generateLocationTour(
        dest,
        loc,
        undefined,
        category,
        'exterior_interior',
        specificLocations,
        { isAbroad: true, locationType: locType, stopCount }
      );
      spendManifestation();
      onClose();
      setDestinationName('');
      setLocation('');
      setLocationType('');
      setStopCount('5-7');
      setSpecifics('');
      navigate(`/tour/${newTour.id}`);
    } catch (err) {
      console.error('Abroad tour generation failed', err);
      const msg = err?.message || String(err);
      setError(msg || 'Failed to generate tour. Please try again.');
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
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground">Tours Abroad</h2>
                <p className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider">International Haunts</p>
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
                    placeholder="e.g. Edinburgh Castle"
                    value={destinationName}
                    onChange={e => setDestinationName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Country / Region
                </label>
                <DrawerSelect
                  icon={MapPin}
                  value={location}
                  onChange={setLocation}
                  placeholder="Select a country..."
                  options={LOCATION_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Location Type
                </label>
                <DrawerSelect
                  icon={Building2}
                  value={locationType}
                  onChange={setLocationType}
                  placeholder="Select type..."
                  options={TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Number of Stops
                </label>
                <DrawerSelect
                  icon={Hash}
                  value={stopCount}
                  onChange={setStopCount}
                  placeholder="Select stop count..."
                  options={STOP_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Specific Areas (Optional)
                </label>
                <textarea
                  placeholder="e.g. Great Hall, Vaults, Crown Room"
                  value={specifics}
                  onChange={e => setSpecifics(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors resize-none"
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1">List specific areas within the destination you want included, separated by commas.</p>
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
                    Be Patient: Complex Tour Build in Progress…
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    Generate Tour Abroad <EnergyCostBadge type="manifestation" cost={1} />
                  </>
                )}
              </button>

              <p className="text-[10px] text-muted-foreground/60 text-center">
                All stops stay within the destination. Coordinates are verified and routes optimized — same rules as domestic tours.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <ExistingTourDialog tour={existingTour} onClose={() => setExistingTour(null)} />
    <UpgradePrompt show={showUpgrade} onClose={() => setShowUpgrade(false)} reason={gateReason} />
    </>
  );
}