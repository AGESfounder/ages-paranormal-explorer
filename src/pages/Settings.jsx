import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Moon, Sun, Volume2, Music, Download, Shield, Info, Navigation, Trash2, FileText, ScrollText, Ban } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';
import { useHauntedAudio } from '@/lib/HauntedAudioContext';
import { getBlockedUsers, unblockUser } from '@/lib/userBlocks';

const defaultSettings = {
  backgroundMusic: true,
  musicVolume: 40,
  narrationVolume: 80,
  darkMode: true,
  offlineDownloads: false,
  locationTracking: true,
  safetyAlerts: true
};

export default function Settings() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const haunt = useHauntedAudio();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const user = await base44.auth.me();
      const isAdmin = user?.role === 'admin';
      if (user?.settings) {
        const saved = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
        setSettings({ ...defaultSettings, ...saved, isAdmin });
      } else {
        setSettings(prev => ({ ...prev, isAdmin }));
      }
    } catch (e) { /* use defaults */ }
    setLoaded(true);
  };

  const updateSetting = async (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await base44.auth.updateMe({ settings: JSON.stringify(updated) });
    } catch (e) { /* silently fail */ }
  };

  const toggle = (key) => updateSetting(key, !settings[key]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const loadBlockedUsers = async () => {
    try { setBlockedUsers(await getBlockedUsers()); } catch {}
  };

  const handleUnblock = async (id) => {
    const next = await unblockUser(id);
    setBlockedUsers(next.map((b) => (typeof b === 'string' ? { id: b, name: 'Blocked user' } : b)).filter((b) => b?.id));
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await base44.functions.invoke('delete-account');
      base44.auth.logout('/login');
    } catch (e) {
      setDeleting(false);
    }
  };

  if (!loaded) {
    return (
      <PageContainer>
        <SectionHeader title="Settings" subtitle="App Preferences" showBack />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader title="Settings" subtitle="App Preferences" showBack />
      <div className="px-4 pb-28 space-y-4 pt-3">
        {/* Audio */}
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
          <div className="p-3 border-b border-border/30">
            <h3 className="text-xs font-heading uppercase tracking-wider text-primary flex items-center gap-2"><Volume2 className="w-3.5 h-3.5" /> Audio</h3>
          </div>
          <div className="p-3 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Background Music</p>
              <p className="text-[10px] text-muted-foreground">Haunted music box atmosphere</p>
            </div>
            <Switch checked={settings.backgroundMusic} onCheckedChange={(v) => {
              const next = { ...settings, backgroundMusic: v, backgroundMusicConfigured: true };
              setSettings(next);
              haunt.setEnabledLive(v);
              base44.auth.updateMe({ settings: JSON.stringify(next) }).catch(() => {});
            }} />
          </div>
          <div className="px-3 pb-3">
            <p className="text-[10px] text-muted-foreground mb-1">Narration Volume</p>
            <input type="range" min="0" max="100" value={settings.narrationVolume} onChange={e => updateSetting('narrationVolume', Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <div className="px-3 pb-3">
            <p className="text-[10px] text-muted-foreground mb-1">Music Volume</p>
            <input type="range" min="0" max="100" value={settings.musicVolume} onChange={e => { const v = Number(e.target.value); updateSetting('musicVolume', v); haunt.setVolumeLive(v / 100); }} className="w-full accent-primary" />
          </div>
        </div>

        {/* Navigation */}
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
          <div className="p-3 border-b border-border/30">
            <h3 className="text-xs font-heading uppercase tracking-wider text-primary flex items-center gap-2"><Navigation className="w-3.5 h-3.5" /> Navigation</h3>
          </div>
          <div className="p-3 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Location Tracking</p>
              <p className="text-[10px] text-muted-foreground">GPS for nearby tours</p>
            </div>
            <Switch checked={settings.locationTracking} onCheckedChange={() => toggle('locationTracking')} />
          </div>
          <div className="p-3 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Safety Alerts</p>
              <p className="text-[10px] text-muted-foreground">Trespassing & hazard warnings</p>
            </div>
            <Switch checked={settings.safetyAlerts} onCheckedChange={() => toggle('safetyAlerts')} />
          </div>
        </div>

        {/* Offline */}
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
          <div className="p-3 border-b border-border/30">
            <h3 className="text-xs font-heading uppercase tracking-wider text-primary flex items-center gap-2"><Download className="w-3.5 h-3.5" /> Storage</h3>
          </div>
          <div className="p-3 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Offline Downloads</p>
              <p className="text-[10px] text-muted-foreground">Download tours for offline use</p>
            </div>
            <Switch checked={settings.offlineDownloads} onCheckedChange={() => toggle('offlineDownloads')} />
          </div>
        </div>

        {/* Admin — only for admins */}
        {settings.isAdmin && (
          <a href="/admin" className="block rounded-xl border border-primary/20 bg-primary/5 overflow-hidden hover:border-primary/40 transition-colors">
            <div className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-primary" /> Admin Panel</p>
                <p className="text-[10px] text-muted-foreground">Manage tours, products & orders</p>
              </div>
              <Shield className="w-4 h-4 text-primary/50" />
            </div>
          </a>
        )}

        {/* Legal — Privacy Policy & Terms of Service */}
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
          <div className="p-3 border-b border-border/30">
            <h3 className="text-xs font-heading uppercase tracking-wider text-primary flex items-center gap-2"><ScrollText className="w-3.5 h-3.5" /> Legal</h3>
          </div>
          <Link to="/privacy" className="flex items-center justify-between p-3 border-b border-border/20 hover:bg-primary/5 transition-colors">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary/70" />
              <span className="text-sm text-foreground">Privacy Policy</span>
            </div>
            <span className="text-[10px] text-muted-foreground">View ›</span>
          </Link>
          <Link to="/terms" className="flex items-center justify-between p-3 hover:bg-primary/5 transition-colors">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-primary/70" />
              <span className="text-sm text-foreground">Terms of Service</span>
            </div>
            <span className="text-[10px] text-muted-foreground">View ›</span>
          </Link>
        </div>

        {/* Blocked Users */}
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
          <div className="p-3 border-b border-border/30">
            <h3 className="text-xs font-heading uppercase tracking-wider text-primary flex items-center gap-2"><Ban className="w-3.5 h-3.5" /> Blocked Users</h3>
          </div>
          <div className="p-3">
            {blockedUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">You haven't blocked anyone.</p>
            ) : (
              <div className="space-y-2">
                {blockedUsers.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg bg-secondary/30 border border-border/30 px-3 py-2">
                    <span className="text-sm text-foreground truncate">{b.name}</span>
                    <Button variant="outline" size="sm" onClick={() => handleUnblock(b.id)}>Unblock</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* About */}
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
          <div className="p-3 border-b border-border/30">
            <h3 className="text-xs font-heading uppercase tracking-wider text-primary flex items-center gap-2"><Info className="w-3.5 h-3.5" /> About</h3>
          </div>
          <div className="p-4 text-center">
            <h2 className="font-display text-2xl text-primary mb-1">AGES</h2>
            <p className="text-xs text-muted-foreground">Accessible Ghost Exploration Solutions</p>
            <p className="text-[10px] text-muted-foreground/60 mt-2">Version 1.0.0</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">Explore Past Existence and its Connection to Today's Enigmas.</p>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 overflow-hidden">
          <div className="p-3 border-b border-destructive/20">
            <h3 className="text-xs font-heading uppercase tracking-wider text-destructive flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Danger Zone</h3>
          </div>
          <div className="p-3 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Delete Account</p>
              <p className="text-[10px] text-muted-foreground">Permanently remove your account & sign out</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>Delete</Button>
          </div>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>This permanently removes your AGES account and all associated data. This action cannot be undone. You will be signed out immediately.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" disabled={deleting} onClick={handleDeleteAccount}>{deleting ? 'Deleting…' : 'Delete Account'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <NavBar />
    </PageContainer>
  );
}