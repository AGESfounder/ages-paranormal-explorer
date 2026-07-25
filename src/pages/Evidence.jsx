import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Trash2, FileAudio, Image, Video, FileText, Loader2, Archive, Upload, X, Check, ClipboardList, Lock, Globe, BarChart3 } from 'lucide-react';
import EquipmentSelectDrawer from '@/components/EquipmentSelectDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/PullToRefresh';

const typeIcons = { evp: ClipboardList, photo: Image, video: Video, note: FileText };
const typeLabel = { evp: 'Personal Experience', photo: 'Photograph', video: 'Video', note: 'Note' };

const equipmentOptions = [
  'REM Device',
  'PIR Device',
  'EVP Device',
  'EMF Device',
  'Thermal Device',
  'SLS Camera',
  'XLS Camera',
  'Vibration Device',
  'Radio Sweeper',
  'Anomaly Camera',
  'Trigger Object',
  'Other',
];

function getTodayDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getNowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export default function Evidence() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tourId = searchParams.get('tourId');
  const stopId = searchParams.get('stopId');
  const locationName = searchParams.get('location');
  const cameFromStop = tourId != null;

  const [evidences, setEvidences] = useState([]);
  const [stopEvidences, setStopEvidences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(
    cameFromStop || window.location.pathname === '/evidence/new'
  );
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [otherDeviceText, setOtherDeviceText] = useState('');
  const fileInputRef = useRef(null);

  const [initialDate] = useState(cameFromStop ? getTodayDate() : '');
  const [initialTime] = useState(cameFromStop ? getNowTime() : '');
  const [initialLocation] = useState(locationName ? decodeURIComponent(locationName) : '');

  const [form, setForm] = useState({
    title: '',
    type: 'note',
    description: '',
    tour_id: tourId || '',
    stop_id: stopId || '',
    location_name: initialLocation,
    date: initialDate,
    time: initialTime,
    equipment: [],
    file_url: '',
    activity_level: 0,
    emf_activity: 0,
    evp_quality: 0,
    personal_experience: 0,
    latitude: '',
    longitude: '',
    is_private: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { loadEvidence(); }, []);

  const loadEvidence = async () => {
    const data = await base44.entities.Evidence.list('-created_date');
    setEvidences(data);
    if (stopId) {
      const stopData = await base44.entities.Evidence.filter({ stop_id: stopId }, '-created_date');
      setStopEvidences(stopData);
    }
    setLoading(false);
  };

  const handleGoBack = () => {
    if (cameFromStop) {
      navigate(-1);
    } else {
      setShowForm(false);
    }
  };

  const toggleEquipment = (item) => {
    setForm(prev => {
      const eq = [...(prev.equipment || [])];
      const idx = eq.indexOf(item);
      if (idx >= 0) {
        eq.splice(idx, 1);
        if (item === 'Other') setOtherDeviceText('');
      } else {
        eq.push(item);
      }
      return { ...prev, equipment: eq };
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, file_url: result.file_url }));
    } catch (err) {
      console.error('Upload failed', err);
    }
    setUploading(false);
  };

  const resetStopForm = () => {
    setForm({
      title: '',
      type: 'note',
      description: '',
      tour_id: tourId || '',
      stop_id: stopId || '',
      location_name: initialLocation,
      date: initialDate,
      time: initialTime,
      equipment: [],
      file_url: '',
      activity_level: 0,
      emf_activity: 0,
      evp_quality: 0,
      personal_experience: 0,
      latitude: '',
      longitude: '',
      is_private: false,
    });
    setOtherDeviceText('');
    setEquipmentOpen(false);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSubmitting(true);
    const payload = { ...form };
    if (payload.equipment.includes('Other') && otherDeviceText.trim()) {
      payload.equipment = payload.equipment.map(e => e === 'Other' ? 'Other: ' + otherDeviceText.trim() : e);
    }
    await base44.entities.Evidence.create(payload);
    setSubmitting(false);

    if (cameFromStop) {
      resetStopForm();
      const stopData = await base44.entities.Evidence.filter({ stop_id: stopId }, '-created_date');
      setStopEvidences(stopData);
    } else {
      setForm({ title: '', type: 'note', description: '', tour_id: '', stop_id: '', location_name: '', date: '', time: '', equipment: [], file_url: '', activity_level: 0, emf_activity: 0, evp_quality: 0, personal_experience: 0 });
      setOtherDeviceText('');
      setEquipmentOpen(false);
      setShowForm(false);
      loadEvidence();
    }
  };

  const handleDelete = async (id) => {
    await base44.entities.Evidence.delete(id);
    if (cameFromStop) {
      const stopData = await base44.entities.Evidence.filter({ stop_id: stopId }, '-created_date');
      setStopEvidences(stopData);
    } else {
      loadEvidence();
    }
  };

  // ── Stop-based evidence view (form + numbered entries) ──
  if (cameFromStop) {
    return (
      <PageContainer>
        <SectionHeader title="Log Evidence" subtitle={form.location_name || "Evidence Entry"} showBack onBack={handleGoBack} />
        <div className="px-4 pb-28 space-y-4 pt-3">

          {/* Date + Time (auto-filled) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Date</label>
              <Input value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="bg-card/50 border-border/50" />
            </div>
            <div>
              <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Time</label>
              <Input value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="bg-card/50 border-border/50" />
            </div>
          </div>

          {/* Location (auto-filled) */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Location</label>
            <Input value={form.location_name} disabled className="bg-card/30 border-border/30 text-muted-foreground" />
          </div>

          {/* GPS Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Latitude</label>
              <Input type="number" placeholder="e.g. 40.7128" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} className="bg-card/50 border-border/50" />
            </div>
            <div>
              <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Longitude</label>
              <Input type="number" placeholder="e.g. -74.0060" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} className="bg-card/50 border-border/50" />
            </div>
          </div>

          {/* Privacy Toggle */}
          <button
            onClick={() => setForm(prev => ({ ...prev, is_private: !prev.is_private }))}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${form.is_private ? 'border-amber-500/40 bg-amber-500/10' : 'border-primary/30 bg-primary/5'}`}
          >
            {form.is_private ? <Lock className="w-4 h-4 text-amber-400 shrink-0" /> : <Globe className="w-4 h-4 text-primary shrink-0" />}
            <div className="text-left">
              <p className={`text-xs font-heading uppercase tracking-wider ${form.is_private ? 'text-amber-400' : 'text-primary'}`}>{form.is_private ? 'Private' : 'Public'}</p>
              <p className="text-[10px] text-muted-foreground">{form.is_private ? 'Only you can see this entry' : 'Visible on the community map'}</p>
            </div>
          </button>

          {/* Evidence Type */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-2">Evidence Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {['note', 'photo', 'video', 'evp'].map(type => {
                const Icon = typeIcons[type];
                return (
                  <button key={type} onClick={() => setForm({...form, type})} className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all ${form.type === type ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border/40 bg-card/30 text-muted-foreground'}`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-[9px] font-heading uppercase">{typeLabel[type]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Equipment */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Equipment Used</label>
            <EquipmentSelectDrawer
              value={form.equipment}
              onChange={(eq) => setForm(prev => ({ ...prev, equipment: eq }))}
              options={equipmentOptions}
            />
            {form.equipment.includes('Other') && (
              <Input
                placeholder="Specify equipment..."
                value={otherDeviceText}
                onChange={e => setOtherDeviceText(e.target.value)}
                className="mt-2 bg-card/50 border-border/50"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Evidence Notes</label>
            <Textarea
              placeholder="Record your observations, readings, and experiences..."
              value={form.description}
              onChange={e => setForm({...form, description: e.target.value})}
              className="bg-card/50 border-border/50 min-h-[100px]"
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Upload Evidence File</label>
            <input ref={fileInputRef} type="file" onChange={handleFileUpload} accept="image/*,video/*,audio/*" className="hidden" />
            {form.file_url ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Check className="w-4 h-4 text-primary" />
                <span className="text-xs text-primary flex-1 truncate">File uploaded</span>
                <button onClick={() => setForm({...form, file_url: ''})} className="p-1 text-muted-foreground hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border/60 bg-card/30 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-xs font-heading uppercase tracking-wider">
                  {uploading ? 'Uploading...' : 'Upload Photo, Video, or Recording'}
                </span>
              </button>
            )}
          </div>

          {/* Rating Stars */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'activity_level', label: 'Evidence' },
              { key: 'personal_experience', label: 'Experience' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">{label}</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setForm({...form, [key]: star})}
                      className={`text-base transition-colors ${star <= form[key] ? 'text-primary' : 'text-muted-foreground/30'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Title */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Entry Title</label>
            <Input placeholder="Name this evidence entry" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="bg-card/50 border-border/50" />
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-primary text-primary-foreground hover:bg-primary/80 font-heading uppercase tracking-wider">
            {submitting ? 'Saving...' : 'Save Evidence'}
          </Button>

          {/* ── Saved entries for this stop ── */}
          {stopEvidences.length > 0 && (
            <div>
              <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> {stopEvidences.length} Evidence {stopEvidences.length === 1 ? 'Entry' : 'Entries'} at This Stop
              </h3>
              <div className="space-y-2">
                {stopEvidences.map((e, i) => {
                  const entryNum = stopEvidences.length - i;
                  const Icon = typeIcons[e.type] || FileText;
                  return (
                    <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="p-4 rounded-xl border border-border/40 bg-card/40 relative">
                      <span className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold font-heading flex items-center justify-center shadow-lg">
                        {entryNum}
                      </span>
                      <div className="flex items-start justify-between ml-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10"><Icon className="w-4 h-4 text-primary" /></div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{e.title}</p>
                            <p className="text-[10px] text-muted-foreground">{typeLabel[e.type]} {e.date ? `• ${e.date}` : ''} {e.time || ''}</p>
                            {e.equipment?.length > 0 && (
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Equipment: {Array.isArray(e.equipment) ? e.equipment.join(', ') : e.equipment}</p>
                            )}
                          </div>
                        </div>
                        <button onClick={() => handleDelete(e.id)} className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      {e.description && <p className="text-log text-xs text-foreground/60 mt-2 ml-3 leading-relaxed">{e.description}</p>}
                      {e.file_url && (
                        <div className="mt-2 ml-3">
                          {e.type === 'photo' ? (
                            <img src={e.file_url} alt={e.title} className="w-full max-h-48 object-cover rounded-lg" />
                          ) : e.type === 'video' ? (
                            <video src={e.file_url} controls className="w-full max-h-48 rounded-lg" />
                          ) : e.type === 'evp' ? (
                            <audio src={e.file_url} controls className="w-full" />
                          ) : (
                            <a href={e.file_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View Attachment</a>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  // ── General evidence journal view ──
  if (showForm) {
    return (
      <PageContainer>
        <SectionHeader title="Log Evidence" subtitle="New Entry" showBack onBack={handleGoBack} />
        <div className="px-4 pb-28 space-y-4 pt-3">

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Date</label>
              <Input value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="bg-card/50 border-border/50" />
            </div>
            <div>
              <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Time</label>
              <Input value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="bg-card/50 border-border/50" />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Location</label>
            <Input value={form.location_name} onChange={e => setForm({...form, location_name: e.target.value})} placeholder="Where did this evidence come from?" className="bg-card/50 border-border/50" />
          </div>

          {/* GPS Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Latitude</label>
              <Input type="number" placeholder="e.g. 40.7128" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} className="bg-card/50 border-border/50" />
            </div>
            <div>
              <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Longitude</label>
              <Input type="number" placeholder="e.g. -74.0060" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} className="bg-card/50 border-border/50" />
            </div>
          </div>

          {/* Privacy Toggle */}
          <button
            onClick={() => setForm(prev => ({ ...prev, is_private: !prev.is_private }))}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${form.is_private ? 'border-amber-500/40 bg-amber-500/10' : 'border-primary/30 bg-primary/5'}`}
          >
            {form.is_private ? <Lock className="w-4 h-4 text-amber-400 shrink-0" /> : <Globe className="w-4 h-4 text-primary shrink-0" />}
            <div className="text-left">
              <p className={`text-xs font-heading uppercase tracking-wider ${form.is_private ? 'text-amber-400' : 'text-primary'}`}>{form.is_private ? 'Private' : 'Public'}</p>
              <p className="text-[10px] text-muted-foreground">{form.is_private ? 'Only you can see this entry' : 'Visible on the community map'}</p>
            </div>
          </button>

          {/* Evidence Type */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-2">Evidence Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {['note', 'photo', 'video', 'evp'].map(type => {
                const Icon = typeIcons[type];
                return (
                  <button key={type} onClick={() => setForm({...form, type})} className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all ${form.type === type ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border/40 bg-card/30 text-muted-foreground'}`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-[9px] font-heading uppercase">{typeLabel[type]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Equipment */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Equipment Used</label>
            <EquipmentSelectDrawer
              value={form.equipment}
              onChange={(eq) => setForm(prev => ({ ...prev, equipment: eq }))}
              options={equipmentOptions}
            />
            {form.equipment.includes('Other') && (
              <Input
                placeholder="Specify equipment..."
                value={otherDeviceText}
                onChange={e => setOtherDeviceText(e.target.value)}
                className="mt-2 bg-card/50 border-border/50"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Evidence Notes</label>
            <Textarea
              placeholder="Record your observations, readings, and experiences..."
              value={form.description}
              onChange={e => setForm({...form, description: e.target.value})}
              className="bg-card/50 border-border/50 min-h-[100px]"
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Upload Evidence File</label>
            <input ref={fileInputRef} type="file" onChange={handleFileUpload} accept="image/*,video/*,audio/*" className="hidden" />
            {form.file_url ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Check className="w-4 h-4 text-primary" />
                <span className="text-xs text-primary flex-1 truncate">File uploaded</span>
                <button onClick={() => setForm({...form, file_url: ''})} className="p-1 text-muted-foreground hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border/60 bg-card/30 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-xs font-heading uppercase tracking-wider">
                  {uploading ? 'Uploading...' : 'Upload Photo, Video, or Recording'}
                </span>
              </button>
            )}
          </div>

          {/* Rating Stars */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'activity_level', label: 'Evidence' },
              { key: 'personal_experience', label: 'Experience' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">{label}</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setForm({...form, [key]: star})}
                      className={`text-base transition-colors ${star <= form[key] ? 'text-primary' : 'text-muted-foreground/30'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Title */}
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1">Entry Title</label>
            <Input placeholder="Name this evidence entry" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="bg-card/50 border-border/50" />
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-primary text-primary-foreground hover:bg-primary/80 font-heading uppercase tracking-wider">
            {submitting ? 'Saving...' : 'Save Evidence'}
          </Button>
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader title="Evidence Journal" subtitle="Your Findings" rightAction={
        <div className="flex items-center gap-1">
          <Link to="/evidence-dashboard" className="p-2" title="Evidence Dashboard"><BarChart3 className="w-5 h-5 text-primary" /></Link>
          <button onClick={() => setShowForm(true)} className="p-2"><Plus className="w-5 h-5 text-primary" /></button>
        </div>
      } />
      <PullToRefresh onRefresh={loadEvidence}>
      <div className="px-4 pb-28 space-y-3 pt-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
        ) : evidences.length === 0 ? (
          <div className="text-center py-16">
            <Archive className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-heading text-sm">No evidence logged yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tap + to record your first finding</p>
            <button onClick={() => setShowForm(true)} className="mt-4 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">Add New Entry</button>
          </div>
        ) : (
          evidences.map((e, i) => {
            const Icon = typeIcons[e.type] || FileText;
            return (
              <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="p-4 rounded-xl border border-border/40 bg-card/40">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><Icon className="w-4 h-4 text-primary" /></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{e.title}</p>
                      <p className="text-[10px] text-muted-foreground">{typeLabel[e.type]} {e.location_name ? `• ${e.location_name}` : ''} {e.date ? `• ${e.date}` : ''}</p>
                      {e.equipment?.length > 0 && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">Equipment: {Array.isArray(e.equipment) ? e.equipment.join(', ') : e.equipment}</p>
                      )}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(e.id)} className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {e.description && <p className="text-log text-xs text-foreground/60 mt-2 leading-relaxed">{e.description}</p>}
                {e.file_url && e.type === 'photo' && <img src={e.file_url} alt={e.title} className="mt-2 w-full max-h-48 object-cover rounded-lg" />}
                {e.file_url && e.type === 'video' && <video src={e.file_url} controls className="mt-2 w-full max-h-48 rounded-lg" />}
                {e.file_url && e.type === 'evp' && <audio src={e.file_url} controls className="mt-2 w-full" />}
              </motion.div>
            );
          })
        )}
      </div>
      </PullToRefresh>
      <NavBar />
    </PageContainer>
  );
}