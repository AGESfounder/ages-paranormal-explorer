import React, { useState, useRef, useEffect } from 'react';
import { Heart, Plus, Trash2, Loader2, Download, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { isTourOffline, saveTourOffline, removeTourOffline } from '@/lib/offlineTours';
import { addTourStops } from '@/lib/addTourStops';
import { toast } from '@/components/ui/use-toast';

const BUTTON_WIDTH = 60;
const SWIPE_THRESHOLD = 50;
const TOTAL_BUTTONS = 4;
const MAX_SWIPE = BUTTON_WIDTH * TOTAL_BUTTONS;

export default function SwipeableTourCard({ tour, onRefresh, onDelete, children }) {
  const [swipeX, setSwipeX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  useEffect(() => {
    base44.entities.Favorite.filter({ tour_id: tour.id }).then(favs => setIsFavorite(favs.length > 0));
    setIsDownloaded(isTourOffline(tour.id));
    base44.auth.me().then(u => setIsAdmin(u?.role === 'admin')).catch(() => {});
  }, [tour.id]);

  const reset = () => { setSwipeX(0); setIsOpen(false); };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = false;
  };

  const handleTouchMove = (e) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      swiping.current = true;
      if (dx < 0) {
        setSwipeX(Math.max(-MAX_SWIPE, dx));
      } else if (isOpen) {
        setSwipeX(Math.min(0, -MAX_SWIPE + dx));
      }
    }
  };

  const handleTouchEnd = () => {
    if (!swiping.current) return;
    if (swipeX < -SWIPE_THRESHOLD) {
      setSwipeX(-MAX_SWIPE);
      setIsOpen(true);
    } else {
      reset();
    }
  };

  const handleFavorite = async (e) => {
    e.stopPropagation();
    reset();
    setActionLoading('favorite');
    try {
      if (isFavorite) {
        const favs = await base44.entities.Favorite.filter({ tour_id: tour.id });
        for (const f of favs) await base44.entities.Favorite.delete(f.id);
        setIsFavorite(false);
      } else {
        await base44.entities.Favorite.create({ tour_id: tour.id, tour_title: tour.title, state: tour.state, city: tour.city });
        setIsFavorite(true);
      }
    } catch (e) { /* ignore */ }
    setActionLoading(null);
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    reset();
    if (isDownloaded) {
      removeTourOffline(tour.id);
      setIsDownloaded(false);
      return;
    }
    setActionLoading('download');
    try {
      const stops = await base44.entities.TourStop.filter({ tour_id: tour.id });
      saveTourOffline(tour, stops);
      setIsDownloaded(true);
    } catch (err) { /* ignore */ }
    setActionLoading(null);
  };

  const handleAddStops = async (e) => {
    e.stopPropagation();
    reset();
    setActionLoading('addStops');
    try {
      const result = await addTourStops(tour);
      if (result.reason === 'max') {
        toast({
          title: 'Maximum Stops Reached',
          description: 'This tour already has the maximum of 12 stops.',
          variant: 'destructive',
        });
      } else if (result.added > 0) {
        if (onRefresh) onRefresh(tour.id);
        toast({
          title: 'Stops Added',
          description: `${result.added} new stop${result.added > 1 ? 's' : ''} added to the tour.`,
        });
      } else {
        toast({
          title: 'No New Stops Added',
          description: 'Could not generate additional stops at this time. Please try again.',
        });
      }
    } catch (e) {
      toast({
        title: 'Failed to Add Stops',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
    setActionLoading(null);
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    reset();
    if (!isAdmin) {
      toast({
        title: "Admin Access Required",
        description: "Only administrators can delete tours.",
        variant: "destructive",
      });
      return;
    }
    setActionLoading('delete');
    try {
      const favs = await base44.entities.Favorite.filter({ tour_id: tour.id });
      for (const f of favs) await base44.entities.Favorite.delete(f.id);
      if (onDelete) onDelete(tour.id);
    } catch (e) { /* ignore */ }
    setActionLoading(null);
  };

  return (
    <div className="relative overflow-hidden rounded-xl" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="absolute inset-y-0 right-0 flex">
        <button
          onClick={handleFavorite}
          disabled={!!actionLoading}
          className="w-[60px] flex flex-col items-center justify-center gap-0.5 bg-red-500/30 text-white/60 disabled:opacity-30"
        >
          {actionLoading === 'favorite' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className={`w-5 h-5 ${isFavorite ? 'fill-white' : ''}`} />}
          <span className="text-[11px] font-heading uppercase tracking-wider">Fav</span>
        </button>
        <button
          onClick={handleAddStops}
          disabled={!!actionLoading}
          className="w-[60px] flex flex-col items-center justify-center gap-0.5 bg-amber-500/30 text-white/60 disabled:opacity-30"
        >
          {actionLoading === 'addStops' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          <span className="text-[11px] font-heading uppercase tracking-wider">Add Stops</span>
        </button>
        <button
          onClick={handleDownload}
          disabled={!!actionLoading}
          className="w-[60px] flex flex-col items-center justify-center gap-0.5 bg-primary/30 text-white/60 disabled:opacity-30"
        >
          {actionLoading === 'download' ? <Loader2 className="w-5 h-5 animate-spin" /> : isDownloaded ? <CheckCircle2 className="w-5 h-5" /> : <Download className="w-5 h-5" />}
          <span className="text-[11px] font-heading uppercase tracking-wider">{isDownloaded ? 'Saved' : 'Download'}</span>
        </button>
        <button
          onClick={handleDelete}
          disabled={!!actionLoading}
          className="w-[60px] flex flex-col items-center justify-center gap-0.5 bg-destructive/30 text-white/60 disabled:opacity-30"
        >
          {actionLoading === 'delete' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
          <span className="text-[11px] font-heading uppercase tracking-wider">Delete</span>
        </button>
      </div>

      <div
        style={{ transform: `translateX(${swipeX}px)`, transition: swiping.current ? 'none' : 'transform 0.2s ease' }}
        className={isOpen ? 'pointer-events-none select-none' : ''}
      >
        {children}
      </div>
    </div>
  );
}