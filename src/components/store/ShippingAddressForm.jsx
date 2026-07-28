import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const fieldClass = 'h-8 text-sm rounded-md border border-input bg-transparent px-2 w-full focus:outline-none focus:ring-1 focus:ring-ring';

export default function ShippingAddressForm({ address, onChange }) {
  const set = (k, v) => onChange({ ...address, [k]: v });
  const a = address || {};
  return (
    <div className="space-y-2 rounded-xl border border-border/40 bg-secondary/20 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <MapPin className="w-4 h-4" />
        <span className="text-[10px] font-heading uppercase tracking-wider">Ship to (live rate calculated)</span>
      </div>
      <div className="space-y-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</Label>
          <Input value={a.name || ''} onChange={e => set('name', e.target.value)} placeholder="Full name" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Street address</Label>
          <Input value={a.street || ''} onChange={e => set('street', e.target.value)} placeholder="123 Main St" className="h-8 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">City</Label>
            <Input value={a.city || ''} onChange={e => set('city', e.target.value)} placeholder="City" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">State</Label>
            <select value={a.state || ''} onChange={e => set('state', e.target.value)} className={fieldClass}>
              <option value="">--</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">ZIP</Label>
          <Input value={a.zip || ''} onChange={e => set('zip', e.target.value)} placeholder="12345" className="h-8 text-sm" inputMode="numeric" />
        </div>
      </div>
    </div>
  );
}