import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Calendar, Star } from 'lucide-react';

const TITLES = { investigations: 'Investigations', favorites: 'Favorites', states: 'States Explored' };

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

function InvestigationsList({ items }) {
  if (!items.length) return <p className="text-sm text-muted-foreground text-center py-8">No investigations yet.</p>;
  return (
    <div className="space-y-2">
      {items.map((inv) => (
        <div key={inv.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-card/30">
          <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{inv.location_name}</p>
            <p className="text-[10px] text-muted-foreground">{[inv.city, inv.state].filter(Boolean).join(', ')}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-foreground">{fmtDate(inv.date)}</p>
            {inv.time && <p className="text-[10px] text-muted-foreground">{inv.time}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function FavoritesList({ items }) {
  if (!items.length) return <p className="text-sm text-muted-foreground text-center py-8">No favorites yet.</p>;
  return (
    <div className="space-y-2">
      {items.map((fav) => (
        <div key={fav.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-card/30">
          <Star className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{fav.tour_title}</p>
            <p className="text-[10px] text-muted-foreground">{[fav.city, fav.state].filter(Boolean).join(', ')}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatesList({ items }) {
  const counts = {};
  for (const inv of items) {
    if (!inv.state) continue;
    counts[inv.state] = (counts[inv.state] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  if (!sorted.length) return <p className="text-sm text-muted-foreground text-center py-8">No states explored yet.</p>;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-3 pb-1 text-[10px] font-heading uppercase tracking-wider text-muted-foreground">
        <span>State</span><span>Tours Completed</span>
      </div>
      {sorted.map(([state, count]) => (
        <div key={state} className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-card/30">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <p className="text-sm text-foreground">{state}</p>
          </div>
          <p className="font-display text-lg text-primary">{count}</p>
        </div>
      ))}
    </div>
  );
}

export default function ProfileStatModal({ type, onClose, investigations, favorites }) {
  return (
    <AnimatePresence>
      {type && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="relative w-full sm:w-[420px] max-h-[80dvh] overflow-y-auto bg-card border border-border/50 rounded-t-2xl sm:rounded-2xl shadow-2xl px-5 pt-5 pb-modal-safe mx-0 sm:mx-4">
            <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors z-10"><X className="w-5 h-5" /></button>
            <h2 className="font-heading text-base font-semibold text-foreground mb-4 pr-8">{TITLES[type]}</h2>
            {type === 'investigations' && <InvestigationsList items={investigations} />}
            {type === 'favorites' && <FavoritesList items={favorites} />}
            {type === 'states' && <StatesList items={investigations} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}