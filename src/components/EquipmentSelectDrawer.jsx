import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';

// Native-style slide-up multi-select for equipment. Mirrors the DrawerSelect
// pattern but supports multiple selections with checkboxes and a Done action.
export default function EquipmentSelectDrawer({ value = [], onChange, options, placeholder = 'Select equipment...', label = 'Equipment Used' }) {
  const [open, setOpen] = useState(false);

  const toggle = (item) => {
    const next = value.includes(item) ? value.filter(v => v !== item) : [...value, item];
    onChange(next);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between min-h-[44px] px-3 py-2 rounded-lg bg-card/50 border border-border/50 text-sm text-foreground hover:border-primary/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all active:scale-[0.98]"
      >
        <span className={`text-left truncate ${value.length === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
          {value.length === 0 ? placeholder : value.join(', ')}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground pointer-events-none shrink-0" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[78vh]">
          <DrawerHeader className="text-left pb-2 flex items-center justify-between">
            <DrawerTitle className="font-heading text-sm uppercase tracking-wider">{label}</DrawerTitle>
            <span className="text-xs text-muted-foreground">{value.length} selected</span>
          </DrawerHeader>
          <div className="overflow-y-auto px-3 pb-2 max-h-[55vh] space-y-1">
            {options.map(opt => {
              const selected = value.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className="flex items-center gap-3 w-full min-h-[44px] px-4 py-3 rounded-lg text-left text-sm transition-colors hover:bg-primary/10 active:bg-primary/15"
                >
                  <span className={`flex items-center justify-center w-5 h-5 rounded-md border transition-colors ${selected ? 'bg-primary border-primary' : 'border-border/70 bg-card/40'}`}>
                    {selected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                  </span>
                  <span className={selected ? 'text-primary font-medium' : 'text-foreground'}>{opt}</span>
                </button>
              );
            })}
          </div>
          <DrawerFooter className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            <Button onClick={() => setOpen(false)} className="w-full h-11 font-heading uppercase tracking-wider">
              Done
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}