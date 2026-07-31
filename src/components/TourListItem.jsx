import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Footprints, Car } from 'lucide-react';
import TourCategoryBadge from './TourCategoryBadge';
import AccessTypeBadge from './AccessTypeBadge';

const RANK_STYLES = {
  1: 'bg-primary/15 text-primary border-b border-primary/20',
  2: 'bg-amber-500/15 text-amber-400 border-b border-amber-500/20',
  3: 'bg-red-500/15 text-red-400 border-b border-red-500/20',
};

const DIFFICULTY_STYLES = {
  easy: 'text-green-400',
  moderate: 'text-yellow-400',
  challenging: 'text-red-400',
};

export default function TourListItem({ tour, distance }) {
  if (!tour) return null;
  return (
    <Link to={`/tour/${tour.id}`} className="block group">
      <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden hover:border-primary/40 hover:bg-card/60 transition-all duration-300">
        {tour.rank && tour.rank <= 3 && (
          <div className={`px-4 py-1.5 text-center font-heading text-[10px] uppercase tracking-wider font-bold ${RANK_STYLES[tour.rank]}`}>
            #{tour.rank} Most Active
          </div>
        )}
        <div className="p-4 space-y-2.5">
          {/* Title — left aligned, optional distance on right */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-heading text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">{tour.title}</h3>
            {distance !== undefined && distance < Infinity && (
              <span className="text-xs text-primary font-heading tracking-wide shrink-0 mt-0.5">{Math.round(distance)} mi</span>
            )}
          </div>
          {/* Location | Category (centered) | Tour type (right aligned) */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{tour.city}, {tour.state}</span>
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <TourCategoryBadge category={tour.tour_category} />
              <AccessTypeBadge accessType={tour.access_type} />
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 capitalize">
              {tour.tour_type === 'walking' ? <Footprints className="w-3 h-3" /> : tour.tour_type === 'mixed' ? <><Footprints className="w-3 h-3" /><Car className="w-2.5 h-2.5" /></> : <Car className="w-3 h-3" />}
              {tour.tour_type === 'mixed' ? 'Walk + Drive' : tour.tour_type}
            </span>
          </div>
          {/* Two line summary */}
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{tour.description}</p>
          {/* Duration | Distance (centered) | Difficulty */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {tour.estimated_duration || '—'}</span>
            <span className="flex items-center gap-1"><Footprints className="w-3 h-3" /> {tour.total_distance || '—'}</span>
            <span className={`font-heading uppercase tracking-wider font-bold ${DIFFICULTY_STYLES[tour.difficulty] || ''}`}>{tour.difficulty || '—'}</span>
          </div>
          {/* 3 descriptors */}
          {tour.tags?.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {tour.tags.slice(0, 3).map((tag, i) => (
                <span key={tag} className={`px-1.5 py-0.5 text-[11px] rounded bg-primary/10 text-primary font-heading tracking-wider capitalize truncate ${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'}`}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}