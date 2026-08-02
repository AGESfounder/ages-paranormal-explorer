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
import { getBlockedUsers, unblockUser } from '@/lib/userBlocks';
import { setMusicSettings } from '@/lib/hauntedAudio';

const defaultSettings = {
  backgroundMusic: true,
  musicVolume: 50,
  narrationVolume: 80,
  hauntedMusic: true,
  hauntedMusicVolume: 50,
  darkMode: true,
  offlineDownloads: false,
  locationTracking: true,
  safetyAlerts: true
};

export default function Settings() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loaded, setLoaded] = useState(false);

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
        setMusicSettings({
          enabled: saved.backgroundMusic ?? defaultSettings.backgroundMusic,
          volume: saved.musicVolume ?? defaultSettings.musicVolume,
          hauntedEnabled: saved.hauntedMusic ?? defaultSettings.hauntedMusic,
          hauntedVolume: saved.hauntedMusicVolume ?? defaultSettings.hauntedMusicVolume,
        });
      } else {
        setSettings(prev => ({ ...prev, isAdmin }));
        setMusicSettings({
          enabled: defaultSettings.backgroundMusic,
          volume: defaultSettings.musicVolume,
          hauntedEnabled: defaultSettings.hauntedMusic,
          hauntedVolume: defaultSettings.hauntedMusicVolume,
        });
      }
    } catch (e) { /* use defaults */ }
    setLoaded(true);
  };

  const updateSetting = async (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    if (key === 'backgroundMusic') setMusicSettings({ enabled: value });
    if (key === 'musicVolume') setMusicSettings({ volume: value });
    if (key === 'hauntedMusic') setMusicSettings({ hauntedEnabled: value });
    if (key === 'hauntedMusicVolume') setMusicSettings({ hauntedVolume: value });
    try {
      await base44.auth.updateMe({ settings: JSON.stringify(updated) });
    } catch (e) { /* silently fail */ }
  };

  const toggle = (key) => updateSetting(key, !settings[key]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

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
              <p className="text-sm text-foreground">Narration Music</p>
              <p className="text-[10px] text-muted-foreground">Chimes during voice narration</p>
            </div>
            <Switch checked={settings.backgroundMusic} onCheckedChange={() => toggle('backgroundMusic')} />
          </div>
          <div className="px-3 pb-3">
            <p className="text-[10px] text-muted-foreground mb-1">Narration Music Volume</p>
            <input type="range" min="0" max="100" value={settings.musicVolume} onChange={e => updateSetting('musicVolume', Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <div className="px-3 pb-3">
            <p className="text-[10px] text-muted-foreground mb-1">Narration Voice Volume</p>
            <input type="range" min="0" max="100" value={settings.narrationVolume} onChange={e => updateSetting('narrationVolume', Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <div className="p-3 flex items-center justify-between border-t border-border/30">
            <div>
              <p className="text-sm text-foreground">Haunted Ambience</p>
              <p className="text-[10px] text-muted-foreground">Background haunted music box</p>
            </div>
            <Switch checked={settings.hauntedMusic} onCheckedChange={() => toggle('hauntedMusic')} />
          </div>
          <div className="px-3 pb-3">
            <p className="text-[10px] text-muted-foreground mb-1">Haunted Ambience Volume</p>
            <input type="range" min="0" max="100" value={settings.hauntedMusicVolume} onChange={e => updateSetting('hauntedMusicVolume', Number(e.target.value))} className="w-full accent-primary" />
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
          <Link to="/terms" className="flex items-center justify-between p-3 border-b border-border/20 hover:bg-primary/5 transition-colors">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-primary/70" />
              <span className="text-sm text-foreground">Terms of Service</span>
            </div>
            <span className="text-[10px] text-muted-foreground">View ›</span>
          </Link>
          <button onClick={() => setDisclaimerOpen(true)} className="w-full flex items-center justify-between p-3 hover:bg-primary/5 transition-colors">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-primary/70" />
              <span className="text-sm text-foreground">Explorer App Disclaimer</span>
            </div>
            <span className="text-[10px] text-muted-foreground">View ›</span>
          </button>
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

      <Dialog open={disclaimerOpen} onOpenChange={setDisclaimerOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Explorer App Disclaimer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs text-foreground/80 leading-relaxed">
            <p>Explorer is designed to help users discover historic locations, learn about local legends, and conduct their own paranormal investigations.</p>
            <p>The information, AI-generated content, narrated stories, and investigative suggestions provided by this app are intended for educational and entertainment purposes. While some investigators believe certain environmental conditions or unexplained phenomena may be associated with paranormal activity, there is no scientifically accepted evidence that ghosts or spirits exist or that any method can conclusively detect them.</p>
            <p>Explorer does not claim or guarantee the existence of ghosts, spirits, or other paranormal entities, nor does it claim that any location or experience will produce paranormal activity. Any observations, experiences, photographs, recordings, or equipment readings should be interpreted by each user using their own judgment.</p>
            <p>Always respect private property, obey local laws, and prioritize your personal safety while exploring. Never enter restricted areas or trespass in search of paranormal experiences.</p>
            <p>By using Explorer, you acknowledge that the app is intended to enhance your exploration of history, folklore, and the paranormal through self-guided experiences and that no specific results or paranormal encounters are promised or guaranteed.</p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <NavBar />
    </PageContainer>
  );
}