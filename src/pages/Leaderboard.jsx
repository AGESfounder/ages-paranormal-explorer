import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Ghost, Loader2, User, Medal } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';

const RANK_STYLES = [
  'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
  'text-slate-300 border-slate-300/40 bg-slate-300/10',
  'text-amber-600 border-amber-600/40 bg-amber-600/10',
];

const RANK_LABELS = ['👻 Ghost Lord', '🌑 Specter', '🕯️ Phantom'];

function getRank(count) {
  if (count >= 50) return { label: 'Ghost Lord', emoji: '👻' };
  if (count >= 20) return { label: 'Specter', emoji: '🌑' };
  if (count >= 10) return { label: 'Phantom', emoji: '🕯️' };
  if (count >= 5)  return { label: 'Investigator', emoji: '🔦' };
  return { label: 'Novice', emoji: '🔍' };
}

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.functions.invoke('leaderboard', {})
      .then(res => {
        setLeaderboard(res.data?.leaderboard || []);
        setCurrentUserId(res.data?.currentUserId || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageContainer>
      <SectionHeader title="Leaderboard" subtitle="Top Ghost Investigators" showBack />
      <div className="px-4 pb-28 pt-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
        ) : leaderboard.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Ghost className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground font-heading uppercase tracking-wider">No investigators yet</p>
            <p className="text-xs text-muted-foreground text-center">Complete an investigation to appear here!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, i) => {
              const isMe = entry.id === currentUserId;
              const rank = getRank(entry.count);
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    isMe
                      ? 'border-primary/50 bg-primary/10 shadow-[0_0_12px_hsl(199,89%,48%,0.15)]'
                      : i < 3
                      ? RANK_STYLES[i] + ' border'
                      : 'border-border/30 bg-card/30'
                  }`}
                >
                  {/* Position */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-heading text-sm font-bold ${
                    i === 0 ? 'bg-yellow-400/20 text-yellow-400' :
                    i === 1 ? 'bg-slate-300/20 text-slate-300' :
                    i === 2 ? 'bg-amber-600/20 text-amber-500' :
                    'bg-secondary/40 text-muted-foreground'
                  }`}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-secondary/40 border border-border/40 overflow-hidden flex items-center justify-center shrink-0">
                    {entry.profile_image_url
                      ? <img src={entry.profile_image_url} alt={entry.name} className="w-full h-full object-cover" />
                      : <User className="w-4 h-4 text-muted-foreground" />}
                  </div>

                  {/* Name + rank */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isMe ? 'text-primary' : 'text-foreground'}`}>
                      {entry.name}{isMe ? ' (You)' : ''}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{rank.emoji} {rank.label}</p>
                  </div>

                  {/* Count */}
                  <div className="text-right shrink-0">
                    <p className={`font-display text-xl ${isMe ? 'text-primary' : i < 3 ? '' : 'text-foreground'}`}>{entry.count}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-heading">tours</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
      <NavBar />
    </PageContainer>
  );
}