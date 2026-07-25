import React, { useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { blockUser } from '@/lib/userBlocks';
import { useToast } from '@/components/ui/use-toast';

const REASONS = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or threats' },
  { value: 'offensive_content', label: 'Offensive or harmful content' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'other', label: 'Something else' },
];

// ReportContentDialog lets a user flag UGC and optionally block its author.
// It is purely additive: it only creates Report records and (optionally) adds
// the author to the user's block list. It never modifies the reported content.
export default function ReportContentDialog({
  open,
  onOpenChange,
  targetType, // 'comment' | 'evidence'
  targetId,
  authorId,   // created_by_id of the content (optional)
  authorName, // display name for the block toggle label
}) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [blockToo, setBlockToo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const reset = () => {
    setReason('');
    setDetails('');
    setBlockToo(false);
  };

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await base44.entities.Report.create({
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details.trim(),
        status: 'pending',
      });
      if (blockToo && authorId) {
        await blockUser(authorId, authorName);
      }
      toast({ title: 'Report submitted', description: 'Thank you. Our team will review this content.' });
      reset();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not submit report', description: 'Please try again later.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Flag className="w-4 h-4 text-destructive" /> Report content</DialogTitle>
          <DialogDescription>
            Help keep SGT by AGES safe. Reports are reviewed by our team and may result in content removal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            {REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  reason === r.value
                    ? 'border-destructive/60 bg-destructive/10 text-foreground'
                    : 'border-border/50 bg-card/40 text-foreground hover:border-border'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <Textarea
            placeholder="Add details (optional)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="bg-card/50 border-border/50 min-h-[80px] resize-none"
          />

          {authorId && (
            <label className="flex items-center gap-2 px-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={blockToo}
                onChange={(e) => setBlockToo(e.target.checked)}
                className="accent-destructive w-4 h-4"
              />
              <span className="text-xs text-muted-foreground">
                Also block {authorName || 'this user'} — hide their content from me
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={submitting || !reason} onClick={handleSubmit}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {submitting ? 'Submitting...' : 'Submit report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}