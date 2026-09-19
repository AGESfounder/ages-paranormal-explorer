import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Trash2, Map, Volume2, Clock, MapPin, Loader2 } from 'lucide-react';
import { listOfflineTours, removeTourOffline } from '@/lib/offlineTours';
import { clearAllTiles } from '@/lib/offlineTiles';
import { clearTourAudio } from '@/lib/offlineAudio';
import TourCategoryBadge from '@/components/TourCategoryBadge';
import { toast } from '@/components/ui/use-toast';

export default function SavedToursList() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  const load = () => {
    const entries = listOfflineTours();
    setTours(entries);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRemove = async (tourId) => {
    setRemovingId(tourId);
    try {
      // Clear audio cache for this tour
      await clearTourAudio(tourId);
      // Note: tiles may be shared between tours, so we don't clear the
      // entire tile cache here. Tiles are cleaned up when ALL offline tours
      // are removed (or the user clears browser data).
      const result = removeTourOffline(tourId);
      if (result?.ok === false) {
        toast({ title: 'Could not remove', description: result.message, variant: 'destructive' });
        setRemovingId(null);
        return;
      }
      toast({ title: 'Offline tour removed', description: 'Saved data cleared from this device.' });
      load();
    } catch (e) {
      toast({ title: 'Could not remove', description: 'Please try again.', variant: 'destructive' });
    }
    setRemovingId(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  if (tours.length === 0) {
    return (
      <div className="text-center py-16">
        <Download className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground font-heading text-sm">No tours saved for offline</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Swipe left on any tour and tap Download to save it</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tours.map((entry, i) => {
        const tour = entry.tour || {};
        const stops = entry.stops || [];
        const hasAudio = tour._offline_audio || entry.hasAudio;
        const level = tour._offline_level || entry.level || 'text';
        const savedDate = entry.savedAt ? new Date(entry.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const stopCount = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle').length;

        return (
          <motion.div
            key={tour.id || i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden">
              <div className="p-4 space-y-2.5">
                {/* Title + remove */}
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/tour/${tour.id}`} className="flex-1 min-w-0">
                    <h3 className="font-heading text-sm font-bold text-foreground hover:text-primary transition-colors truncate">{tour.title}</h3>
                  </Link>
                  <button
                    onClick={() => handleRemove(tour.id)}
                    disabled={removingId === tour.id}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 disabled:opacity-50"
                  >
                    {removingId === tour.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>

                {/* Location + category */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{tour.city}, {tour.state}</span>
                  </span>
                  <TourCategoryBadge category={tour.tour_category} />
                </div>

                {/* Description */}
                {tour.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{tour.description}</p>
                )}

                {/* Badges: what's saved */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider bg-primary/15 text-primary border border-primary/30">
                    <Map className="w-3 h-3" /> Maps + Text
                  </span>
                  {hasAudio && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider bg-accent/20 text-accent-foreground border border-accent/40">
                      <Volume2 className="w-3 h-3" /> Narration
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" /> {savedDate}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {stopCount} stop{stopCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}