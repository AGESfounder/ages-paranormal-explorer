import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, Waves, ScanFace, Zap, Image, FileText, MapPin, Loader2, ArrowLeft, ClipboardList } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import PageContainer from '@/components/PageContainer';
import NavBar from '@/components/NavBar';
import SectionHeader from '@/components/SectionHeader';
import { base44 } from '@/api/base44Client';

const CATEGORIES = [
  { key: 'EVP', label: 'EVP', icon: Waves, color: '#3b82f6' },
  { key: 'Anomaly', label: 'Anomaly', icon: ScanFace, color: '#22c55e' },
  { key: 'Vibration', label: 'Vibration', icon: Zap, color: '#a855f7' },
  { key: 'Photo', label: 'Photo', icon: Image, color: '#eab308' },
  { key: 'Note', label: 'Note', icon: FileText, color: '#06b6d4' },
  { key: 'Other Video', label: 'Other Video', icon: ClipboardList, color: '#64748b' },
];

function categorize(ev) {
  if (ev.type === 'evp') return 'EVP';
  if (ev.type === 'photo') return 'Photo';
  if (ev.type === 'note') return 'Note';
  if (ev.type === 'video') {
    const t = `${ev.title || ''} ${ev.description || ''}`.toLowerCase();
    if (/anomaly/.test(t)) return 'Anomaly';
    if (/vibration/.test(t)) return 'Vibration';
    return 'Other Video';
  }
  return 'Note';
}

export default function EvidenceDashboard() {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const items = await base44.entities.Evidence.list('-created_date', 2000);
        setEvidence(items);
      } catch (e) {
        console.error('Failed to load evidence', e);
      }
      setLoading(false);
    })();
  }, []);

  // Aggregate by location
  const byLocation = {};
  evidence.forEach(ev => {
    const loc = (ev.location_name || '').trim() || 'Unspecified Location';
    const cat = categorize(ev);
    if (!byLocation[loc]) byLocation[loc] = { location: loc, total: 0 };
    byLocation[loc][cat] = (byLocation[loc][cat] || 0) + 1;
    byLocation[loc].total += 1;
  });
  const rows = Object.values(byLocation).sort((a, b) => b.total - a.total);

  // Totals per category
  const totals = {};
  evidence.forEach(ev => {
    const cat = categorize(ev);
    totals[cat] = (totals[cat] || 0) + 1;
  });

  const chartData = rows.map(r => {
    const label = r.location.length > 14 ? r.location.slice(0, 12) + '…' : r.location;
    const entry = { location: label };
    CATEGORIES.forEach(c => { entry[c.key] = r[c.key] || 0; });
    return entry;
  });

  return (
    <PageContainer>
      <SectionHeader
        title="Evidence Dashboard"
        subtitle="Summary by Location"
        showBack
      />
      <div className="px-4 pb-28 pt-3 space-y-5">
        <Link to="/evidence" className="flex items-center gap-1.5 text-xs text-primary font-heading uppercase tracking-wider hover:text-primary/80 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Evidence Journal
        </Link>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          </div>
        ) : evidence.length === 0 ? (
          <div className="text-center py-20">
            <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-heading text-sm">No evidence collected yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Record evidence to see location summaries here</p>
          </div>
        ) : (
          <>
            {/* Category totals */}
            <div>
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-2">Total by Type</p>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(c => {
                  const Icon = c.icon;
                  const count = totals[c.key] || 0;
                  return (
                    <div key={c.key} className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5" style={{ color: c.color }} />
                      </div>
                      <p className="text-lg font-mono font-bold text-foreground">{count}</p>
                      <p className="text-[10px] text-muted-foreground">{c.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stacked bar chart */}
            {chartData.length > 0 && (
              <div className="p-4 rounded-xl border border-border/40 bg-card/30">
                <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" /> Evidence per Location
                </p>
                <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 48)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 30% 17%)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'hsl(215 20% 55%)', fontSize: 10 }} stroke="hsl(215 30% 17%)" allowDecimals={false} />
                    <YAxis type="category" dataKey="location" tick={{ fill: 'hsl(215 20% 65%)', fontSize: 10 }} stroke="hsl(215 30% 17%)" width={90} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(222 47% 8%)', border: '1px solid hsl(215 30% 17%)', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: 'hsl(210 40% 92%)' }}
                      cursor={{ fill: 'hsl(215 30% 17% / 0.3)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {CATEGORIES.map(c => (
                      <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} radius={[0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Table breakdown */}
            <div>
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary" /> Location Breakdown
              </p>
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-card/50 border-b border-border/40">
                      <th className="text-left px-3 py-2 font-heading uppercase tracking-wider text-[10px] text-muted-foreground">Location</th>
                      {CATEGORIES.map(c => (
                        <th key={c.key} className="text-center px-1.5 py-2 font-heading uppercase tracking-wider text-[10px] text-muted-foreground" title={c.label}>{c.label.slice(0, 4)}</th>
                      ))}
                      <th className="text-center px-2 py-2 font-heading uppercase tracking-wider text-[10px] text-primary">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <motion.tr
                        key={r.location}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-border/20 last:border-0 hover:bg-card/20 transition-colors"
                      >
                        <td className="px-3 py-2.5 text-foreground truncate max-w-[120px]" title={r.location}>{r.location}</td>
                        {CATEGORIES.map(c => (
                          <td key={c.key} className="text-center px-1.5 py-2.5 font-mono text-muted-foreground">
                            {r[c.key] ? <span style={{ color: c.color }}>{r[c.key]}</span> : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        ))}
                        <td className="text-center px-2 py-2.5 font-mono font-bold text-primary">{r.total}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
      <NavBar />
    </PageContainer>
  );
}