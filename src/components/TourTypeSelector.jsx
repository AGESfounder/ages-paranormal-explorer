import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

const TOUR_TYPES = [
  { value: 'exterior_interior', label: 'Interior/Exterior', description: 'Full property access' },
  { value: 'interior_only', label: 'Interior Only', description: 'Inside the building' },
  { value: 'exterior_only', label: 'Exterior Only', description: 'Grounds & perimeter' },
];

export default function TourTypeSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-primary shrink-0" />
      <div className="flex flex-col shrink-0">
        <span className="text-sm font-heading uppercase tracking-wider text-foreground">Tour Type</span>
        <span className="text-[10px] text-muted-foreground">Access Classification</span>
      </div>
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs border-primary/30 bg-primary/5 hover:bg-primary/10 gap-1">
          <SelectValue placeholder="Select access type" />
        </SelectTrigger>
        <SelectContent>
          {TOUR_TYPES.map(t => (
            <SelectItem key={t.value} value={t.value} className="py-2">
              <div className="flex flex-col gap-0.5">
                <span className="font-heading text-sm">{t.label}</span>
                <span className="text-[10px] text-muted-foreground">{t.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}