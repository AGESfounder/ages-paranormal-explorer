import React, { useEffect, useState } from 'react';
import { Search, Loader2, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';

// Searches existing tours (server-side) so an admin can pick one to compare.
export default function TourPicker({ selectedId, onSelect }) {
  const [query, setQuery] = useState('');
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const q = query.trim();
        const where = q
          ? {
              $or: [
                { title: { $regex: q, $options: 'i' } },
                { city: { $regex: q, $options: 'i' } },
                { state: { $regex: q, $options: 'i' } },
              ],
            }
          : {};
        const page = await base44.entities.Tour.filter(where, { sort: '-created_date', limit: 40 });
        if (active) setTours(page.items || []);
      } catch (e) {
        if (active) setTours([]);
      } finally {
        if (active) setLoading(false);
      }
    }, query ? 350 : 0);

    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search tours by title, city, or state..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 bg-card/50 border-border/40 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        </div>
      ) : tours.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">No tours found.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto toolkit-scroll space-y-1.5">
          {tours.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                selectedId === t.id
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border/40 bg-card/40 hover:bg-card/60'
              }`}
            >
              <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{t.city}, {t.state}</span>
                <span className="uppercase tracking-wider text-[10px]">{t.tour_category || 'uncategorized'}</span>
              </p>
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground italic">Showing the 40 most recent matches.</p>
    </div>
  );
}