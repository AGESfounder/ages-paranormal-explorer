import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapPin, Calendar, User, Star } from 'lucide-react';
import EvidenceMedia from '@/components/EvidenceMedia';

const typeLabel = { evp: 'EVP', photo: 'Photograph', video: 'Video', note: 'Note' };

export default function EvidenceViewerDialog({ evidence, authorName, open, onOpenChange }) {
  if (!evidence) return null;

  // Private media is resolved to a short-lived signed URL by EvidenceMedia;
  // legacy records still holding a public URL render that URL directly.
  const hasMedia = !!(evidence.file_url || evidence.has_media);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto toolkit-scroll">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">{evidence.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-heading">{typeLabel[evidence.type]}</p>

          {hasMedia && (
            <EvidenceMedia
              recordId={evidence.id}
              mediaType={evidence.type}
              legacyUrl={evidence.file_url}
              lazy={false}
              alt={evidence.title}
              className={
                evidence.type === 'photo'
                  ? 'w-full rounded-lg border border-border/40'
                  : evidence.type === 'video'
                    ? 'w-full rounded-lg border border-border/40'
                    : evidence.type === 'evp'
                      ? 'w-full'
                      : 'text-xs text-primary underline flex items-center gap-1'
              }
            />
          )}

          {evidence.description && (
            <p className="text-sm leading-relaxed text-foreground">{evidence.description}</p>
          )}

          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground pt-1">
            {authorName && (
              <div className="flex items-center gap-1.5">
                <User className="w-3 h-3 shrink-0" /> {authorName}
              </div>
            )}
            {evidence.location_name && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 shrink-0" /> {evidence.location_name}
              </div>
            )}
            {evidence.date && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 shrink-0" /> {evidence.date}{evidence.time ? ` • ${evidence.time}` : ''}
              </div>
            )}
            {evidence.activity_level > 0 && (
              <div className="flex items-center gap-1.5">
                <Star className="w-3 h-3 shrink-0 text-yellow-400" /> {'★'.repeat(evidence.activity_level)}{'☆'.repeat(5 - evidence.activity_level)}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}