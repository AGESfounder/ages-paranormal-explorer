import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Eye, Plus, Loader2, Ghost } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { addTourStops } from '@/lib/addTourStops';
import { toast } from '@/components/ui/use-toast';
import TourCategoryBadge from '@/components/TourCategoryBadge';
import AccessTypeBadge from '@/components/AccessTypeBadge';

export default function ExistingTourDialog({ tour, onClose }) {
  const [addingStops, setAddingStops] = useState(false);
  const navigate = useNavigate();

  const handleView = () => {
    onClose();
    navigate(`/tour/${tour.id}`);
  };

  const handleAddStops = async () => {
    setAddingStops(true);
    try {
      const result = await addTourStops(tour);
      onClose();
      if (result.reason === 'max') {
        toast({ title: 'Maximum Stops Reached', description: 'This tour already has the maximum of 12 stops.', variant: 'destructive' });
      } else if (result.added > 0) {
        toast({ title: 'Stops Added', description: `${result.added} new stop${result.added > 1 ? 's' : ''} added to the tour.` });
      } else {
        toast({ title: 'No New Stops Added', description: 'Could not generate additional stops at this time. Please try again.' });
      }
      navigate(`/tour/${tour.id}`);
    } catch (e) {
      toast({ title: 'Failed to Add Stops', description: e?.message || 'Please try again.', variant: 'destructive' });
    }
    setAddingStops(false);
  };

  return (
    <AnimatePresence>
      {tour && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
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
              disabled={addingStops}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-lg bg-amber-500/10">
                <Ghost className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground">Tour Already Exists</h2>
                <p className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider">This Location Is Already Covered</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              A paranormal tour for this location already exists in our database. You can view the existing tour or add more haunted stops to it.
            </p>

            <div className="rounded-lg border border-border/40 bg-card/40 p-3 mb-4">
              <h3 className="font-heading text-sm font-bold text-foreground truncate">{tour.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {tour.city}, {tour.state}
                </p>
                <TourCategoryBadge category={tour.tour_category} />
                <AccessTypeBadge accessType={tour.access_type} />
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleView}
                disabled={addingStops}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-[0_0_20px_hsl(199,89%,48%,0.2)]"
              >
                <Eye className="w-4 h-4" />
                View Existing Tour
              </button>
              <button
                onClick={handleAddStops}
                disabled={addingStops}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 font-heading text-xs uppercase tracking-wider hover:bg-amber-500/30 transition-colors disabled:opacity-60"
              >
                {addingStops ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding Stops...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Stops to This Tour
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}