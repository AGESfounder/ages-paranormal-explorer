import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapPin, Calendar, User, Star, FileText } from 'lucide-react';

const typeLabel = { evp: 'EVP', photo: 'Photograph', video: 'Video', note: 'Note' };

export default function EvidenceViewerDialog({ evidence, authorName, open, onOpenChange }) {
  if (!evidence) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto toolkit-scroll">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">{evidence.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-heading">{typeLabel[evidence.type]}</p>

          {evidence.file_url && evidence.type === 'photo' && (
            <img src={evidence.file_url} alt={evidence.title} className="w-full rounded-lg border border-border/40" />
          )}
          {evidence.file_url && evidence.type === 'video' && (
            <video src={evidence.file_url} controls className="w-full rounded-lg border border-border/40" />
          )}
          {evidence.file_url && evidence.type === 'evp' && (
            <audio src={evidence.file_url} controls className="w-full" />
          )}
          {evidence.file_url && evidence.type === 'note' && (
            <a href={evidence.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-1">
              <FileText className="w-3 h-3" /> View attached file
            </a>
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