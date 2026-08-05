import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollText } from 'lucide-react';
import { NARRATION_LENGTHS } from '@/lib/narrationLength';

export default function NarrationLengthSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <ScrollText className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground shrink-0">Story Length</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs border-primary/30 bg-primary/5 hover:bg-primary/10 gap-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NARRATION_LENGTHS.map(l => (
            <SelectItem key={l.value} value={l.value} className="py-2">
              <div className="flex flex-col gap-0.5">
                <span className="font-heading text-sm">{l.label}</span>
                <span className="text-[10px] text-muted-foreground">{l.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}