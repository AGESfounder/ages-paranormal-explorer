import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navigation, MapPin, Loader2 } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';

export default function Nearby() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(true);
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLocating(false);
      loadAllTours();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Location access denied');
        setLocating(false);
        loadAllTours();
      }
    );
  }, []);

  useEffect(() => {
    if (coords) loadNearby();
  }, [coords]);

  const loadNearby = async () => {
    const all = await base44.entities.Tour.list();
    const withDist = all.map(t => {
      if (!t.start_latitude || !t.start_longitude) return { ...t, distance: Infinity };
      const dist = getDistance(coords.lat, coords.lng, t.start_latitude, t.start_longitude);
      return { ...t, distance: dist };
    });
    withDist.sort((a, b) => a.distance - b.distance);
    setTours(withDist.slice(0, 10));
    setLoading(false);
  };

  const loadAllTours = async () => {
    const all = await base44.entities.Tour.list('-created_date', 10);
    setTours(all);
    setLoading(false);
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  return (
    <PageContainer>
      <SectionHeader title="Nearby Tours" subtitle={coords ? 'Sorted by distance' : 'Recent tours'} showBack />
      <div className="px-4 pb-28 space-y-3 pt-3">
        {locating ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
              <Loader2 className="w-8 h-8 text-primary" />
            </motion.div>
            <p className="text-sm text-muted-foreground">Locating you...</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
        ) : error && tours.length === 0 ? (
          <div className="text-center py-16">
            <Navigation className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">{error}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Explore states to browse all tours</p>
          </div>
        ) : (
          tours.map((tour, i) => (
            <motion.div key={tour.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/tour/${tour.id}`} className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/40 hover:border-primary/40 hover:bg-card/50 transition-all group">
                <div className="p-2.5 rounded-lg bg-primary/10">
                  <Navigation className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{tour.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" /> {tour.city}, {tour.state}
                  </p>
                </div>
                {tour.distance !== undefined && tour.distance < Infinity && (
                  <span className="text-xs text-primary font-heading tracking-wide">{Math.round(tour.distance)} mi</span>
                )}
              </Link>
            </motion.div>
          ))
        )}
      </div>
      <NavBar />
    </PageContainer>
  );
}