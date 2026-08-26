import React from 'react';
import { Clock, Car, MapPin, DollarSign, Info, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import { truncateText } from '@/lib/narrationLength';

// Renders a single tour stop row. When `provided` is passed (from
// @hello-pangea/dnd Draggable), the row is draggable with a drag handle on
// the number badge. When omitted, it renders as a plain tappable row.
export default function TourStopRow({ stop, onNavigate, onNarrate, isSpeaking, isGenerating, narrationLength, provided, isDragging }) {
  const drag = provided || {};
  return (
    <div
      ref={drag.innerRef}
      {...(drag.draggableProps || {})}
      className={isDragging ? 'opacity-80' : ''}
    >
      <div
        onClick={onNavigate}
        className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-card/30 hover:border-primary/30 hover:bg-card/50 transition-all group cursor-pointer"
      >
        <div
          {...(drag.dragHandleProps || {})}
          className={`flex items-center justify-center w-8 h-8 rounded-full font-heading text-sm font-bold shrink-0 ${drag.dragHandleProps ? 'cursor-grab active:cursor-grabbing select-none' : ''} ${isDragging ? 'ring-2 ring-primary shadow-[0_0_16px_hsl(199,89%,48%,0.5)]' : ''} ${stop.travel_method === 'driving' ? 'bg-amber-500/10 text-amber-400' : 'bg-primary/10 text-primary'}`}
        >
          {stop.stop_number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{stop.name}</p>
            {stop.needs_placement && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-pink-500/15 border border-pink-500/40 text-pink-400 text-[9px] font-heading uppercase tracking-wider">Needs Placement</span>
            )}
            {!stop.needs_placement && stop.geocoded === false && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[9px] font-heading uppercase tracking-wider">Est.</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
            <Clock className="w-2.5 h-2.5" /> {stop.estimated_investigation_time}
            {stop.travel_method === 'driving' && <span className="flex items-center gap-0.5 text-amber-400"><Car className="w-2.5 h-2.5" /> Drive</span>}
            {stop.address && <><MapPin className="w-2.5 h-2.5" /> <span className="truncate">{stop.address}</span></>}
          </p>
        </div>
        {(stop.hours_of_operation || stop.entry_fee) && (
          <div className="flex items-center gap-1 shrink-0">
            {stop.entry_fee && <DollarSign className="w-3 h-3 text-green-400" />}
            {stop.hours_of_operation && <Info className="w-3 h-3 text-amber-400" />}
          </div>
        )}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNarrate(truncateText(stop.narration_text || stop.paranormal_info, narrationLength)); }}
          className={`p-1.5 rounded-md shrink-0 transition-colors ${isSpeaking || isGenerating ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
        >
          {isSpeaking || isGenerating ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </div>
    </div>
  );
}