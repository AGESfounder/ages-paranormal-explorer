import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Globe, Ship, MapPin, Clock, Footprints, ArrowRight, Plus } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import ToursAbroadModal from '../components/ToursAbroadModal';
import { base44 } from '@/api/base44Client';

export default function AbroadTours() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    base44.entities.Tour.filter({}, 'state').then(all => {
      const abroad = all.filter(t => t.tags?.includes('abroad'));
      abroad.sort((a, b) => {
        const locA = (a.state || '').toLowerCase();
        const locB = (b.state || '').toLowerCase();
        if (locA !== locB) return locA.localeCompare(locB);
        return (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase());
      });
      setTours(abroad);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const grouped = tours.reduce((acc, tour) => {
    const loc = tour.state || 'Unknown';
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(tour);
    return acc;
  }, {});

  const locationEntries = Object.entries(grouped).sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));

  return (
    <PageContainer>
      <SectionHeader
        title="Tours Abroad"
        subtitle="International Haunted Destinations"
        showBack
        rightAction={
          <button onClick={() => setShowModal(true)} className="p-2 rounded-lg bg-accent/20 hover:bg-accent/30 text-cyan-glow transition-colors">
            <Plus className="w-5 h-5" />
          </button>
        }
      />
      <div className="px-4 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : locationEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Globe className="w-12 h-12 text-muted-foreground mb-4 opacity-40" />
            <p className="font-heading text-sm uppercase tracking-wider text-muted-foreground">No Abroad Tours Yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create one from the home screen</p>
          </div>
        ) : (
          <div className="space-y-8">
            {locationEntries.map(([location, locationTours]) => (
              <motion.div
                key={location}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  {location.toLowerCase().includes('ship') || location.toLowerCase().includes('sea') || location.toLowerCase().includes('ocean') || location.toLowerCase().includes('atlantic') || location.toLowerCase().includes('pacific') || location.toLowerCase().includes('caribbean') || location.toLowerCase().includes('mediterranean') ? (
                    <Ship className="w-4 h-4 text-cyan-glow" />
                  ) : (
                    <Globe className="w-4 h-4 text-cyan-glow" />
                  )}
                  <h2 className="font-heading text-sm font-semibold tracking-wide uppercase text-foreground">{location}</h2>
                  <span className="text-[10px] text-muted-foreground">({locationTours.length})</span>
                </div>
                <div className="space-y-2">
                  {locationTours.map(tour => (
                    <Link key={tour.id} to={`/tour/${tour.id}`} className="block p-4 rounded-xl border border-border/50 bg-card/40 hover:border-primary/30 hover:bg-card/60 transition-all duration-300">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-heading text-sm font-semibold text-foreground truncate">{tour.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tour.description}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin className="w-3 h-3" />{tour.city}</span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="w-3 h-3" />{tour.estimated_duration}</span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Footprints className="w-3 h-3" />{tour.difficulty}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <ToursAbroadModal isOpen={showModal} onClose={() => { setShowModal(false); }} />
      <NavBar />
    </PageContainer>
  );
}