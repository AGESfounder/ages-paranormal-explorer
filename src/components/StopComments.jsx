import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Loader2, Ghost } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';

export default function StopComments({ stopId, tourId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadComments();
    base44.auth.me().then(setUser).catch(() => {});
  }, [stopId]);

  const loadComments = async () => {
    setLoading(true);
    const data = await base44.entities.StopComment.filter({ stop_id: stopId }, '-created_date');
    setComments(data);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    await base44.entities.StopComment.create({
      stop_id: stopId,
      tour_id: tourId,
      text: text.trim(),
      author_name: user?.full_name || 'Anonymous Investigator',
    });
    setText('');
    await loadComments();
    setSubmitting(false);
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="p-4 rounded-xl border border-border/40 bg-card/30 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h4 className="text-xs font-heading uppercase tracking-wider text-primary">
          Explorer Reports {comments.length > 0 && `(${comments.length})`}
        </h4>
      </div>

      {/* Comment input */}
      <div className="space-y-2">
        <Textarea
          placeholder="Share what you experienced at this location..."
          value={text}
          onChange={e => setText(e.target.value)}
          className="bg-card/50 border-border/50 min-h-[80px] resize-none text-sm"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-40"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {submitting ? 'Posting...' : 'Post Report'}
        </button>
      </div>

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center py-6 gap-2 text-center">
          <Ghost className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No reports yet. Be the first to share your experience!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="p-3 rounded-lg bg-secondary/30 border border-border/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-heading uppercase tracking-wider text-primary">{c.author_name || 'Anonymous Investigator'}</span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_date)}</span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}