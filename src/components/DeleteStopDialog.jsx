import React from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export default function DeleteStopDialog({ open, onOpenChange, stop, remainingCount, onConfirm, deleting }) {
  const wouldBeFinal = remainingCount > 1;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" /> Remove Stop?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block mb-2">
              “{stop?.name}” will be permanently removed from this tour. Remaining stops will be renumbered and the tour marked for re-validation.
            </span>
            {wouldBeFinal && (
              <span className="block text-amber-400">
                The new last stop will become the tour's final stop.
              </span>
            )}
            <span className="block mt-2 text-foreground/60">This cannot be undone.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Removing…</> : 'Remove Stop'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}