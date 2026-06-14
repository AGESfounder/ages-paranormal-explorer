import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Award, MapPin, Ghost, Loader2, Trophy, Star, Shield } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';

const achievements = [
  { id: 'first', name: 'First Investigation', desc: 'Complete your first investigation', icon: Ghost, unlocked: false },
  { id: '10_inv', name: 'Seasoned Explorer', desc: 'Complete 10 investigations', icon: Shield, unlocked: false },
  { id: '50_inv', name: 'Master Investigator', desc: 'Complete 50 investigations', icon: Trophy, unlocked: false },
  { id: 'all50', name: 'All 50 States', desc: 'Explore every U.S. state', icon: Award, unlocked: false },
];

export default function Profile() {
  const [user, setUser] = useState(null);
  const [investigations, setInvestigations] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      const [inv, favs] = await Promise.all([
        base44.entities.Investigation.list('-created_date'),
        base44.entities.Favorite.list('-created_date')
      ]);
      setInvestigations(inv);
      setFavorites(favs);
    } catch (e) {
      // user not logged in
    }
    setLoading(false);
  };

  const uniqueStates = [...new Set(investigations.map(i => i.state).filter(Boolean))];
  const unlockedCount = investigations.length;

  const getAchievementStatus = (ach) => {
    if (ach.id === 'first' && unlockedCount >= 1) return true;
    if (ach.id === '10_inv' && unlockedCount >= 10) return true;
    if (ach.id === '50_inv' && unlockedCount >= 50) return true;
    if (ach.id === 'all50' && uniqueStates.length >= 50) return true;
    return false;
  };

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader title="Profile" />
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
        <NavBar />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader title="Investigator Profile" />
      <div className="px-4 pb-28 space-y-5 pt-3">
        {/* User Card */}
        <div className="p-5 rounded-xl border border-border/40 bg-card/40 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 mx-auto mb-3 flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <h2 className="font-heading text-lg font-bold text-foreground">{user?.full_name || 'Paranormal Explorer'}</h2>
          <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border border-border/40 bg-card/30 text-center">
            <p className="font-display text-2xl text-primary">{investigations.length}</p>
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mt-1">Investigations</p>
          </div>
          <div className="p-3 rounded-lg border border-border/40 bg-card/30 text-center">
            <p className="font-display text-2xl text-primary">{favorites.length}</p>
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mt-1">Favorites</p>
          </div>
          <div className="p-3 rounded-lg border border-border/40 bg-card/30 text-center">
            <p className="font-display text-2xl text-primary">{uniqueStates.length}</p>
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mt-1">States</p>
          </div>
        </div>

        {/* Achievements */}
        <div>
          <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Achievements
          </h3>
          <div className="space-y-2">
            {achievements.map((ach, i) => {
              const unlocked = getAchievementStatus(ach);
              return (
                <motion.div
                  key={ach.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    unlocked
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/30 bg-card/20 opacity-50'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${unlocked ? 'bg-primary/20' : 'bg-secondary/30'}`}>
                    <ach.icon className={`w-5 h-5 ${unlocked ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>{ach.name}</p>
                    <p className="text-[10px] text-muted-foreground">{ach.desc}</p>
                  </div>
                  {unlocked && <Star className="w-4 h-4 fill-primary text-primary" />}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => base44.auth.logout('/login')}
          className="w-full p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-sm font-heading uppercase tracking-wider hover:bg-red-500/10 transition-colors"
        >
          Sign Out
        </button>
      </div>
      <NavBar />
    </PageContainer>
  );
}