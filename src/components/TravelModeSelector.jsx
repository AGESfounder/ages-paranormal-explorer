import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Footprints } from 'lucide-react';

const TRAVEL_MODES = [
  { value: 'mixed', label: 'Mixed Walking/Driving', description: 'All stops' },
  { value: 'walking', label: 'Walking Only', description: 'Skip driving stops' },
];

export default function TravelModeSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Footprints className="w-4 h-4 text-primary shrink-0" />
      <div className="flex flex-col shrink-0">
        <span className="text-sm font-heading uppercase tracking-wider text-foreground">Travel Mode</span>
        <span className="text-[10px] text-muted-foreground">Filter Stops</span>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs border-primary/30 bg-primary/5 hover:bg-primary/10 gap-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRAVEL_MODES.map(m => (
            <SelectItem key={m.value} value={m.value} className="py-2">
              <div className="flex flex-col gap-0.5">
                <span className="font-heading text-sm">{m.label}</span>
                <span className="text-[10px] text-muted-foreground">{m.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}