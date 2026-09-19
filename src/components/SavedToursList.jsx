import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Trash2, Map, Volume2, Clock, MapPin, Loader2, Wifi, WifiOff, Cloud } from 'lucide-react';
import { listOfflineTours, removeTourOffline, isTourOffline } from '@/lib/offlineTours';
import { clearTourAudio } from '@/lib/offlineAudio';
import { base44 } from '@/api/base44Client';
import TourCategoryBadge from '@/components/TourCategoryBadge';
import { toast } from '@/components/ui/use-toast';

const LEVEL_LABELS = {
  free: 'Text + Maps',
  whisper: 'Glimpse',
  echo: 'Uncover',
  manifestation: 'Relive',
};

export default function SavedToursList() {
  const [savedTours, setSavedTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  const load = useCallback(async () => {
    try {
      // 1. Load server-synced SavedTour records (visible on all devices)
      const serverRecords = await base44.entities.SavedTour.list('-created_date');

      // 2. Load local offline tours (device-specific)
      const localTours = listOfflineTours();
      const localMap = {};
      for (const entry of localTours) {
        if (entry.tour?.id) localMap[entry.tour.id] = entry;
      }

      // 3. Merge: server records are the source of truth, but we also check
      // for local-only tours (legacy downloads before server-sync was added)
      const serverIds = new Set(serverRecords.map((r) => r.tour_id));
      const localOnly = localTours
        .filter((e) => e.tour?.id && !serverIds.has(e.tour.id))
        .map((e) => ({
          id: null, // no server record
          tour_id: e.tour.id,
          tour_title: e.tour.title,
          state: e.tour.state,
          city: e.tour.city,
          download_level: e.tour._offline_level || 'free',
          tour_category: e.tour.tour_category,
          created_date: new Date(e.savedAt).toISOString(),
          _localOnly: true,
        }));

      // 4. Build merged list: server records + local-only legacy tours
      const merged = [
        ...serverRecords.map((r) => ({
          ...r,
          _localCopy: localMap[r.tour_id] || null,
          _localOnly: false,
        })),
        ...localOnly.map((r) => ({
          ...r,
          _localCopy: localMap[r.tour_id] || null,
        })),
      ];

      // Sort by created_date descending
      merged.sort((a, b) => {
        const da = new Date(a.created_date || 0).getTime();
        const db = new Date(b.created_date || 0).getTime();
        return db - da;
      });

      setSavedTours(merged);

      // === ONE-TIME MIGRATION ===
      // Backfill server-synced SavedTour records for tours saved BEFORE the
      // cross-device sync feature existed. These are local-only tours (no
      // server record). We create the server bookmark silently — NO content
      // re-generation, NO credit spend. The local offline content stays as-is.
      const localOnlyTours = merged.filter((r) => r._localOnly && r.tour_id);
      if (localOnlyTours.length > 0) {
        for (const record of localOnlyTours) {
          try {
            await base44.entities.SavedTour.create({
              tour_id: record.tour_id,
              tour_title: record.tour_title,
              state: record.state,
              city: record.city,
              download_level: record.download_level || 'free',
              tour_category: record.tour_category,
            });
          } catch (e) {
            console.error('Migration failed for tour', record.tour_id, e);
          }
        }
        // Reload to show the migrated records with their new server IDs
        const refreshed = await base44.entities.SavedTour.list('-created_date');
        setSavedTours((prev) =>
          prev.map((r) => {
            if (!r._localOnly) return r;
            const serverRec = refreshed.find((s) => s.tour_id === r.tour_id);
            return serverRec ? { ...serverRec, _localCopy: r._localCopy, _localOnly: false } : r;
          })
        );
      }
    } catch (e) {
      console.error('Failed to load saved tours:', e);
      // Fall back to local-only if server is unreachable
      const localTours = listOfflineTours();
      setSavedTours(
        localTours.map((e) => ({
          id: null,
          tour_id: e.tour.id,
          tour_title: e.tour.title,
          state: e.tour.state,
          city: e.tour.city,
          download_level: e.tour._offline_level || 'free',
          tour_category: e.tour.tour_category,
          created_date: new Date(e.savedAt).toISOString(),
          _localCopy: e,
          _localOnly: true,
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (record) => {
    const tourId = record.tour_id;
    setRemovingId(tourId);
    try {
      // 1. Clear local audio cache for this tour (if present on this device)
      if (record._localCopy || isTourOffline(tourId)) {
        await clearTourAudio(tourId);
        removeTourOffline(tourId);
      }

      // 2. Delete the server-synced SavedTour record (if it exists)
      if (record.id) {
        await base44.entities.SavedTour.delete(record.id);
      }

      toast({ title: 'Saved tour removed', description: 'Removed from your Saved list.' });
      load();
    } catch (e) {
      console.error('Remove failed:', e);
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

  if (savedTours.length === 0) {
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
      {savedTours.map((record, i) => {
        const hasLocalCopy = !!record._localCopy;
        const level = record.download_level || 'free';
        const levelLabel = LEVEL_LABELS[level] || 'Text + Maps';
        const hasAudio = level !== 'free';
        const savedDate = record.created_date
          ? new Date(record.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '';
        const localEntry = record._localCopy;
        const stops = localEntry?.stops || [];
        const stopCount = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle').length;

        return (
          <motion.div
            key={record.tour_id || i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden">
              <div className="flex">
                <Link to={`/tour/${record.tour_id}`} className="flex-1 p-4 space-y-2.5 active:bg-primary/5 transition-colors">
                  {/* Title */}
                  <h3 className="font-heading text-sm font-bold text-foreground truncate">{record.tour_title}</h3>

                  {/* Location + category */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{record.city}, {record.state}</span>
                    </span>
                    <TourCategoryBadge category={record.tour_category} />
                  </div>

                  {/* Badges: what's saved + device status */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider bg-primary/15 text-primary border border-primary/30">
                      <Map className="w-3 h-3" /> {levelLabel}
                    </span>
                    {hasAudio && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider bg-accent/20 text-accent-foreground border border-accent/40">
                        <Volume2 className="w-3 h-3" /> Narration
                      </span>
                    )}
                    {hasLocalCopy ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30">
                        <WifiOff className="w-3 h-3" /> Offline Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <Wifi className="w-3 h-3" /> Online Only
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" /> {savedDate}
                    </span>
                  </div>

                  {/* Device note for tours without local copy */}
                  {!hasLocalCopy && (
                    <p className="text-[10px] text-amber-400/80 flex items-start gap-1 leading-relaxed pt-1">
                      <Cloud className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>Saved on another device. Offline audio &amp; maps only play on the device that downloaded this tour. Re-download here for offline use.</span>
                    </p>
                  )}

                  {/* Stop count (only if local copy has stops) */}
                  {hasLocalCopy && stopCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {stopCount} stop{stopCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </Link>

                {/* Remove button — separate so it doesn't trigger navigation */}
                <button
                  onClick={() => handleRemove(record)}
                  disabled={removingId === record.tour_id}
                  className="p-3 self-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 disabled:opacity-50"
                >
                  {removingId === record.tour_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}