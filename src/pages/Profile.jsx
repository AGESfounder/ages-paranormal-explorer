import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Award, Ghost, Loader2, Trophy, Star, Shield, Camera, Check, X } from 'lucide-react';
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
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      setEditName(userData.full_name || '');
      const [inv, favs] = await Promise.all([
        base44.entities.Investigation.list('-created_date'),
        base44.entities.Favorite.list('-created_date')
      ]);
      setInvestigations(inv);
      setFavorites(favs);
    } catch (e) {}
    setLoading(false);
  };

  const saveName = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const updated = await base44.auth.updateMe({ full_name: editName.trim() });
      setUser(updated);
      setEditing(false);
    } catch (e) {}
    setSaving(false);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const updated = await base44.auth.updateMe({ profile_image_url: file_url });
      setUser(updated);
    } catch (e) {}
    setUploadingPhoto(false);
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
          <div className="relative w-16 h-16 mx-auto mb-3">
            <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 overflow-hidden flex items-center justify-center">
              {user?.profile_image_url
                ? <img src={user.profile_image_url} alt="Profile" className="w-full h-full object-cover" />
                : <User className="w-8 h-8 text-primary" />}
            </div>
            <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center cursor-pointer hover:bg-primary/80 transition-colors">
              {uploadingPhoto ? <Loader2 className="w-3 h-3 text-primary-foreground animate-spin" /> : <Camera className="w-3 h-3 text-primary-foreground" />}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
          </div>

          {editing ? (
            <div className="flex items-center justify-center gap-2 mt-1">
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="bg-input border border-border rounded-md px-2 py-1 text-sm text-foreground text-center font-heading w-40 focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false); }}
              />
              <button onClick={saveName} disabled={saving} className="p-1 text-green-400 hover:text-green-300">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => setEditing(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="group">
              <h2 className="font-heading text-lg font-bold text-foreground group-hover:text-primary transition-colors">{user?.full_name || 'Paranormal Explorer'}</h2>
              <p className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider">tap to edit name</p>
            </button>
          )}
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