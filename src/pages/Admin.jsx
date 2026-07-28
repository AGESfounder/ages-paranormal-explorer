import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Edit3, Check, Search, Loader2, Shield, MapPin, Clock, Footprints, Car } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Admin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [tours, setTours] = useState([]);
  const [tourSearch, setTourSearch] = useState('');
  const [editingTour, setEditingTour] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadTours = useCallback(async () => {
    try {
      const t = await base44.entities.Tour.list('-created_date', 500);
      setTours(t);
    } catch (e) { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        if (me?.role === 'admin') await loadTours();
        else setLoading(false);
      } catch (e) { setLoading(false); }
    })();
  }, [loadTours]);

  const filteredTours = tours.filter(t =>
    t.title?.toLowerCase().includes(tourSearch.toLowerCase()) ||
    t.state?.toLowerCase().includes(tourSearch.toLowerCase()) ||
    t.city?.toLowerCase().includes(tourSearch.toLowerCase())
  );

  const openEdit = (tour) => {
    setEditingTour(tour);
    setEditForm({
      title: tour.title || '', city: tour.city || '', state: tour.state || '',
      tour_type: tour.tour_type || 'walking', difficulty: tour.difficulty || 'moderate',
      estimated_duration: tour.estimated_duration || '', total_distance: tour.total_distance || '',
      description: tour.description || '', safety_info: tour.safety_info || '',
      best_time: tour.best_time || '', start_location_name: tour.start_location_name || '',
    });
  };

  const saveEdit = async () => {
    if (!editingTour) return;
    setSaving(true);
    await base44.entities.Tour.update(editingTour.id, editForm);
    setTours(prev => prev.map(t => t.id === editingTour.id ? { ...t, ...editForm } : t));
    setEditingTour(null); setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeletingId(deleteConfirm.id);
    const stops = await base44.entities.TourStop.filter({ tour_id: deleteConfirm.id });
    for (const s of stops) await base44.entities.TourStop.delete(s.id);
    const favs = await base44.entities.Favorite.filter({ tour_id: deleteConfirm.id });
    for (const f of favs) await base44.entities.Favorite.delete(f.id);
    await base44.entities.Tour.delete(deleteConfirm.id);
    setTours(prev => prev.filter(t => t.id !== deleteConfirm.id));
    setDeletingId(null); setDeleteConfirm(null);
  };

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader title="Admin Panel" />
        <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        <NavBar />
      </PageContainer>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <PageContainer>
        <SectionHeader title="Access Denied" />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Shield className="w-16 h-16 text-destructive/50" />
          <p className="text-sm text-muted-foreground font-heading uppercase tracking-wider">Admin access required</p>
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader title="Admin Panel" showBack />
      <div className="px-4 pb-28 pt-3">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search tours..." value={tourSearch} onChange={e => setTourSearch(e.target.value)} className="pl-9 bg-card/50 border-border/40 text-sm" />
        </div>
        <div className="space-y-2">
          {filteredTours.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No tours found.</p>
          ) : (
            filteredTours.map((tour, i) => (
              <motion.div key={tour.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="p-3 rounded-lg border border-border/40 bg-card/40 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{tour.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{tour.city}, {tour.state}</span>
                      <span className="flex items-center gap-1">{tour.tour_type === 'walking' ? <Footprints className="w-2.5 h-2.5" /> : tour.tour_type === 'mixed' ? <><Footprints className="w-2.5 h-2.5" /><Car className="w-2 h-2" /></> : <Car className="w-2.5 h-2.5" />}{tour.tour_type}</span>
                      <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{tour.estimated_duration || '—'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(tour)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => setDeleteConfirm(tour)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Tour Edit Dialog */}
      <Dialog open={!!editingTour} onOpenChange={(open) => !open && setEditingTour(null)}>
        <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-wider text-sm">Edit Tour</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Title</Label><Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">City</Label><Input value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
              <div><Label className="text-xs">State</Label><Input value={editForm.state} onChange={e => setEditForm({ ...editForm, state: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Tour Type</Label><Select value={editForm.tour_type} onValueChange={v => setEditForm({ ...editForm, tour_type: v })}><SelectTrigger className="bg-secondary/50 border-border/40 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="walking">Walking</SelectItem><SelectItem value="driving">Driving</SelectItem><SelectItem value="mixed">Mixed</SelectItem></SelectContent></Select></div>
              <div><Label className="text-xs">Difficulty</Label><Select value={editForm.difficulty} onValueChange={v => setEditForm({ ...editForm, difficulty: v })}><SelectTrigger className="bg-secondary/50 border-border/40 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="easy">Easy</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="challenging">Challenging</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Duration</Label><Input value={editForm.estimated_duration} onChange={e => setEditForm({ ...editForm, estimated_duration: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
              <div><Label className="text-xs">Distance</Label><Input value={editForm.total_distance} onChange={e => setEditForm({ ...editForm, total_distance: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            </div>
            <div><Label className="text-xs">Start Location</Label><Input value={editForm.start_location_name} onChange={e => setEditForm({ ...editForm, start_location_name: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div><Label className="text-xs">Description</Label><Input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div><Label className="text-xs">Best Time</Label><Input value={editForm.best_time} onChange={e => setEditForm({ ...editForm, best_time: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div><Label className="text-xs">Safety Info</Label><Input value={editForm.safety_info} onChange={e => setEditForm({ ...editForm, safety_info: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTour(null)} className="text-xs">Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} className="text-xs">{saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tour Delete Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-wider text-sm">Delete Tour</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground/80">Permanently delete <strong>{deleteConfirm?.title}</strong> and all its stops and favorites?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="text-xs">Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletingId} className="text-xs">{deletingId ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NavBar />
    </PageContainer>
  );
}