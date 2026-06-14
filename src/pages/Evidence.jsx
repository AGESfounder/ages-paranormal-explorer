import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Trash2, FileAudio, Image, Video, FileText, Star, Loader2, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import RatingStars from '../components/RatingStars';
import { base44 } from '@/api/base44Client';

const typeIcons = { evp: FileAudio, photo: Image, video: Video, note: FileText };
const typeLabel = { evp: 'EVP Recording', photo: 'Photograph', video: 'Video', note: 'Note' };

export default function Evidence() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [evidences, setEvidences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(
    searchParams.get('tourId') != null || window.location.pathname === '/evidence/new'
  );
  const [form, setForm] = useState({
    title: '', type: 'note', description: '', tour_id: searchParams.get('tourId') || '',
    stop_id: searchParams.get('stopId') || '', location_name: searchParams.get('location') || '',
    activity_level: 0, emf_activity: 0, evp_quality: 0, personal_experience: 0
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadEvidence(); }, []);

  const loadEvidence = async () => {
    const data = await base44.entities.Evidence.list('-created_date');
    setEvidences(data);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSubmitting(true);
    await base44.entities.Evidence.create(form);
    setSubmitting(false);
    setShowForm(false);
    setForm({ title: '', type: 'note', description: '', tour_id: '', stop_id: '', location_name: '', activity_level: 0, emf_activity: 0, evp_quality: 0, personal_experience: 0 });
    loadEvidence();
  };

  const handleDelete = async (id) => {
    await base44.entities.Evidence.delete(id);
    loadEvidence();
  };

  if (showForm) {
    return (
      <PageContainer>
        <SectionHeader title="Log Evidence" subtitle={form.location_name || "New Entry"} showBack onBack={() => setShowForm(false)} />
        <div className="px-4 pb-28 space-y-4 pt-3">
          <Input placeholder="Entry title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="bg-card/50 border-border/50" />
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
          <Textarea placeholder="Description & notes..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="bg-card/50 border-border/50 min-h-[100px]" />
          <div className="grid grid-cols-2 gap-3">
            <RatingStars label="Activity Level" value={form.activity_level} onChange={v => setForm({...form, activity_level: v})} size="sm" />
            <RatingStars label="EMF Activity" value={form.emf_activity} onChange={v => setForm({...form, emf_activity: v})} size="sm" />
            <RatingStars label="EVP Quality" value={form.evp_quality} onChange={v => setForm({...form, evp_quality: v})} size="sm" />
            <RatingStars label="Experience" value={form.personal_experience} onChange={v => setForm({...form, personal_experience: v})} size="sm" />
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
        <button onClick={() => setShowForm(true)} className="p-2"><Plus className="w-5 h-5 text-primary" /></button>
      } />
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
                      <p className="text-[10px] text-muted-foreground">{typeLabel[e.type]} {e.location_name ? `• ${e.location_name}` : ''}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(e.id)} className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {e.description && <p className="text-xs text-foreground/60 mt-2 leading-relaxed">{e.description}</p>}
                {(e.activity_level > 0 || e.personal_experience > 0) && (
                  <div className="flex gap-3 mt-2">
                    {e.activity_level > 0 && <RatingStars value={e.activity_level} size="sm" label="Activity" />}
                    {e.personal_experience > 0 && <RatingStars value={e.personal_experience} size="sm" label="Experience" />}
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
      <NavBar />
    </PageContainer>
  );
}