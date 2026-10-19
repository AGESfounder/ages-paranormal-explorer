import React, { useState } from 'react';
import { Plus, Trash2, Flag, MapPin } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getCategory } from '@/lib/amenityCategories';
import { AmenityIcon } from './amenityIcons';
import AddAmenityForm from './AddAmenityForm';
import ReportContentDialog from '@/components/ReportContentDialog';

// AmenitySheet — the "Add-Ons" panel for a tour. Lists the community amenities
// (icon, name, category, note) with report + delete (own/admin) actions, and an
// "Add an Add-On" button that swaps in the quick form. The parent owns the
// amenity list and passes it in; onAmenitiesChanged tells it to reload after a
// create or delete so the map and list stay in sync.
export default function AmenitySheet({ open, onOpenChange, tourId, amenities, onAmenitiesChanged }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  const sorted = [...amenities].sort((a, b) => {
    const ci = (getCategory(a.category)?.label || '').localeCompare(getCategory(b.category)?.label || '');
    return ci !== 0 ? ci : (a.name || '').localeCompare(b.name || '');
  });

  const handleDelete = async (amenity) => {
    try {
      await base44.entities.TourAmenity.delete(amenity.id);
      toast({ title: 'Field Stop removed' });
      onAmenitiesChanged?.();
    } catch (e) {
      toast({ title: 'Could not remove', variant: 'destructive' });
    }
  };

  const handleSaved = () => {
    setAdding(false);
    onAmenitiesChanged?.();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Field Stops
            </DialogTitle>
            <DialogDescription>
              Restrooms, food, sites to see and more, shared by explorers like you. Field Stops appear on the tour map for everyone.
            </DialogDescription>
          </DialogHeader>

          {adding ? (
            <AddAmenityForm
              tourId={tourId}
              onSaved={handleSaved}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <div className="space-y-2">
              <Button onClick={() => setAdding(true)} className="w-full">
                <Plus className="w-4 h-4 mr-2" /> Add a Field Stop
              </Button>

              {sorted.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">
                  No Field Stops yet. Be the first to add one!
                </p>
              ) : (
                sorted.map((a) => {
                  const cat = getCategory(a.category);
                  const isOwn = !!user && a.created_by_id === user.id;
                  const isAdmin = user?.role === 'admin';
                  return (
                    <div key={a.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 bg-card/40">
                      <div
                        className="mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: `hsl(${cat?.color || '220, 8%, 58%'})` }}
                      >
                        <AmenityIcon category={a.category} className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground font-medium break-words">{a.name}</p>
                        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">{cat?.label}</p>
                        {a.note && <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">{a.note}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setReportTarget(a)}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                          title="Report"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                        {(isOwn || isAdmin) && (
                          <button
                            onClick={() => handleDelete(a)}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReportContentDialog
        open={!!reportTarget}
        onOpenChange={(o) => !o && setReportTarget(null)}
        targetType="amenity"
        targetId={reportTarget?.id}
        authorId={reportTarget?.created_by_id}
      />
    </>
  );
}