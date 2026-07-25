import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, MapPin, Loader2, Ghost } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';

export default function Favorites() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadFavorites(); }, []);

  const loadFavorites = async () => {
    const data = await base44.entities.Favorite.list('-created_date');
    setFavorites(data);
    setLoading(false);
  };

  return (
    <PageContainer>
      <SectionHeader title="Favorites" subtitle="Your Saved Tours" showBack />
      <div className="px-4 pb-28 space-y-3 pt-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-16">
            <Ghost className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-heading text-sm">No favorites saved</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tap the heart on any tour to save it</p>
          </div>
        ) : (
          favorites.map((fav, i) => (
            <motion.div key={fav.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/tour/${fav.tour_id}`} className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/40 hover:border-primary/40 hover:bg-card/50 transition-all duration-300 group">
                <div className="p-2.5 rounded-lg bg-red-500/10"><Heart className="w-5 h-5 fill-red-500 text-red-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{fav.tour_title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" /> {fav.city}, {fav.state}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))
        )}
      </div>
      <NavBar />
    </PageContainer>
  );
}