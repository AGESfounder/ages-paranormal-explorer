import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

// Native-style slide-up drawer selector built on vaul. Replaces <select> with
// a trigger button that opens a bottom sheet of options — feels native on iOS
// WebViews while remaining a standard control on desktop.
export default function DrawerSelect({ value, onChange, options, placeholder = 'Select...', label, icon: Icon, className = '' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative w-full flex items-center ${Icon ? 'pl-10' : 'pl-4'} pr-10 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors cursor-pointer ${className}`}
      >
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />}
        <span className={`flex-1 text-left truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[78vh]">
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="font-heading text-sm uppercase tracking-wider">{label || placeholder}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[60vh] space-y-1">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className="flex items-center justify-between w-full px-4 py-3 rounded-lg text-left text-sm hover:bg-primary/10 active:bg-primary/15 transition-colors"
              >
                <span className={opt.value === value ? 'text-primary font-medium' : 'text-foreground'}>{opt.label}</span>
                {opt.value === value && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}