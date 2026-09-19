import React from 'react';
import { FileText, Image, Video, ClipboardList, Users, Flag, Eye, Layers } from 'lucide-react';

const typeIcons = { evp: ClipboardList, photo: Image, video: Video, note: FileText };
const typeLabel = { evp: 'EVP', photo: 'Photograph', video: 'Video', note: 'Note' };
const typeColors = {
  evp: '#a78bfa',
  photo: '#38bdf8',
  video: '#f472b6',
  note: '#4ade80',
};

// Renders a Leaflet popup for either a single evidence pin or a stack of
// evidence pins at the same coordinates. Each item in a stack gets its own
// row with title, type, author, date, and View/Report actions.
export default function StackedEvidencePopup({ group, authorNames, onView, onReport }) {
  // Single pin — same layout as the original popup
  if (group.length === 1) {
    const pin = group[0];
    return (
      <div className="min-w-[200px]">
        <p className="font-semibold text-sm mb-1">{pin.title}</p>
        <p className="text-xs text-muted-foreground mb-1">{typeLabel[pin.type]}</p>
        {authorNames[pin.created_by_id] && (
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> {authorNames[pin.created_by_id]}
          </p>
        )}
        {pin.location_name && <p className="text-xs">📍 {pin.location_name}</p>}
        {pin.date && <p className="text-xs text-muted-foreground">{pin.date}{pin.time ? ` • ${pin.time}` : ''}</p>}
        {pin.description && <p className="text-xs mt-1 leading-relaxed">{pin.description.slice(0, 120)}{pin.description.length > 120 ? '…' : ''}</p>}
        {pin.activity_level > 0 && (
          <p className="text-xs mt-1">{'★'.repeat(pin.activity_level)}{'☆'.repeat(5 - pin.activity_level)}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => onView(pin)}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <Eye className="w-3 h-3" /> View Evidence
          </button>
          <button
            onClick={() => onReport(pin)}
            className="flex items-center gap-1 text-[11px] text-destructive hover:underline"
          >
            <Flag className="w-3 h-3" /> Report
          </button>
        </div>
      </div>
    );
  }

  // Stacked pins — scrollable list of all evidence at this location
  return (
    <div className="min-w-[220px] max-w-[260px]">
      <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-border/40">
        <Layers className="w-4 h-4 text-primary" />
        <p className="font-semibold text-sm">{group.length} sightings here</p>
      </div>
      <div className="space-y-2 max-h-[220px] overflow-y-auto toolkit-scroll pr-1">
        {group.map(pin => {
          const Icon = typeIcons[pin.type];
          const color = typeColors[pin.type];
          return (
            <div key={pin.id} className="pb-2 border-b border-border/20 last:border-0">
              <div className="flex items-start gap-1.5">
                <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs leading-tight">{pin.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{typeLabel[pin.type]}</span>
                    {authorNames[pin.created_by_id] && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Users className="w-2.5 h-2.5" /> {authorNames[pin.created_by_id]}
                      </span>
                    )}
                  </div>
                  {pin.date && <p className="text-[10px] text-muted-foreground mt-0.5">{pin.date}{pin.time ? ` • ${pin.time}` : ''}</p>}
                  {pin.description && <p className="text-[10px] mt-0.5 leading-relaxed text-muted-foreground">{pin.description.slice(0, 80)}{pin.description.length > 80 ? '…' : ''}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => onView(pin)} className="flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                      <Eye className="w-2.5 h-2.5" /> View
                    </button>
                    <button onClick={() => onReport(pin)} className="flex items-center gap-0.5 text-[10px] text-destructive hover:underline">
                      <Flag className="w-2.5 h-2.5" /> Report
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}