import React, { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { AMENITY_CATEGORIES } from '@/lib/amenityCategories';
import { AmenityIcon } from './amenityIcons';
import LocationPicker from '@/components/LocationPicker';
import { useToast } from '@/components/ui/use-toast';

// Quick form for adding a community amenity to a tour. Name + category +
// location (GPS capture or typed address, reusing LocationPicker) + optional
// note. On save, creates a TourAmenity and calls onSaved so the parent can
// refresh the list and the map.
export default function AddAmenityForm({ tourId, onSaved, onCancel }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [locName, setLocName] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const canSave = name.trim() && category && lat != null && lng != null && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.TourAmenity.create({
        tour_id: tourId,
        name: name.trim(),
        category,
        latitude: lat,
        longitude: lng,
        note: note.trim() || undefined,
      });
      toast({ title: 'Add-on added', description: 'It now appears on the tour map for everyone.' });
      onSaved?.();
    } catch (e) {
      toast({ title: 'Could not save', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1.5">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Visitor Center Restroom"
          className="bg-card/50 border-border/50"
        />
      </div>

      <div>
        <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1.5">Category</label>
        <div className="grid grid-cols-3 gap-2">
          {AMENITY_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-[10px] font-heading uppercase tracking-wider transition-colors min-h-[44px] ${
                category === cat.id
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-border/40 bg-card/30 text-muted-foreground hover:border-border'
              }`}
            >
              <AmenityIcon category={cat.id} className="w-4 h-4" style={{ color: `hsl(${cat.color})` }} />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <LocationPicker
        latitude={lat}
        longitude={lng}
        locationName={locName}
        onChange={({ latitude, longitude, location_name }) => {
          setLat(latitude);
          setLng(longitude);
          setLocName(location_name || '');
        }}
      />

      <div>
        <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1.5">Note (optional)</label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Hours, tips, etc."
          className="bg-card/50 border-border/50 min-h-[60px] resize-none"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} disabled={saving} className="flex-1">Cancel</Button>
        <Button onClick={handleSave} disabled={!canSave} className="flex-1">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          {saving ? 'Saving…' : 'Add to Map'}
        </Button>
      </div>
    </div>
  );
}