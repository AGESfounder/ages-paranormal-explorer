import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, MapPin, Loader2, Ghost, Download, Trash2 } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/PullToRefresh';
import TourCategoryBadge from '@/components/TourCategoryBadge';
import TourListItem from '@/components/TourListItem';
import SavedToursList from '@/components/SavedToursList';

export default function Favorites() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [activeTab, setActiveTab] = useState('favorites');

  useEffect(() => { loadFavorites(); }, []);

  const handleRemoveFavorite = async (favId) => {
    setRemovingId(favId);
    try {
      await base44.entities.Favorite.delete(favId);
      setFavorites(prev => prev.filter(f => f.id !== favId));
    } catch (e) {
      // ignore — item stays in list
    }
    setRemovingId(null);
  };

  const loadFavorites = async () => {
    const data = await base44.entities.Favorite.list('-created_date');
    const tourIds = data.map(f => f.tour_id).filter(Boolean);
    if (tourIds.length > 0) {
      const allTours = await base44.entities.Tour.list('-created_date', 500);
      const tourMap = {};
      allTours.forEach(t => { tourMap[t.id] = t; });
      const enriched = data.map(f => ({ ...f, tour: tourMap[f.tour_id] })).filter(f => f.tour);
      setFavorites(enriched);
    } else {
      setFavorites(data);
    }
    setLoading(false);
  };

  return (
    <PageContainer>
      <SectionHeader title="Favorites" subtitle="Your Saved Tours" showBack />
      <PullToRefresh onRefresh={loadFavorites}>
      <div className="px-4 pb-28 pt-3">
        {/* Tab switcher */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-heading text-xs uppercase tracking-wider transition-colors ${
              activeTab === 'favorites'
                ? 'bg-red-500/15 border border-red-500/40 text-red-400'
                : 'border border-border/40 bg-card/30 text-muted-foreground'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${activeTab === 'favorites' ? 'fill-red-400' : ''}`} />
            Favorites
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-heading text-xs uppercase tracking-wider transition-colors ${
              activeTab === 'saved'
                ? 'bg-primary/15 border border-primary/40 text-primary'
                : 'border border-border/40 bg-card/30 text-muted-foreground'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Saved
          </button>
        </div>

        {activeTab === 'favorites' && (
          <>
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
            ) : favorites.length === 0 ? (
              <div className="text-center py-16">
                <Ghost className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground font-heading text-sm">No favorites saved</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Tap the heart on any tour to save it</p>
              </div>
            ) : (
              <div className="space-y-3">
                {favorites.map((fav, i) => (
                  <motion.div key={fav.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <div className="flex">
                      <div className="flex-1 min-w-0">
                        <TourListItem tour={fav.tour} />
                      </div>
                      <button
                        onClick={() => handleRemoveFavorite(fav.id)}
                        disabled={removingId === fav.id}
                        className="p-3 self-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 disabled:opacity-50"
                      >
                        {removingId === fav.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'saved' && <SavedToursList />}
      </div>
      </PullToRefresh>
      <NavBar />
    </PageContainer>
  );
}