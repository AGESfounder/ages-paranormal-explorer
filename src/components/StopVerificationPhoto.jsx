import React, { useState, useRef } from 'react';
import { Camera, Loader2, X, Lock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

/**
 * Stop validation photo capture.
 * - Unverified stops: button reads "Validate & Add Photo". After the photo is
 *   uploaded (stored publicly), calls onValidateWithPhoto(photoUrl) so the
 *   parent can run GPS validation and persist the photo in one update.
 *   Includes a "Validate location only" option (onValidateOnly) for users who
 *   can't or don't want to take a photo.
 * - Verified stops: button reads "Add Photo". After upload, calls
 *   onPhotoAdded(photoUrl) so the parent saves just the photo.
 * - Taking a new photo replaces the existing one.
 */
export default function StopVerificationPhoto({ stop, disabled, isAdmin, onValidateWithPhoto, onValidateOnly, onPhotoAdded }) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const adminFileInputRef = useRef(null);

  const isVerified = stop.user_verified;
  const hasPhoto = !!stop.verification_photo_url;
  // Once a verified stop has a photo, it's locked — only admins can replace it.
  const canCapture = !isVerified || !hasPhoto || isAdmin;

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid File', description: 'Please select an image.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploading(false);
      setShowInstructions(false);
      if (isVerified) {
        onPhotoAdded?.(file_url);
      } else {
        onValidateWithPhoto?.(file_url);
      }
    } catch (err) {
      toast({ title: 'Upload Failed', description: 'Could not upload photo. Please try again.', variant: 'destructive' });
      setUploading(false);
    }
  };

  // Admin-only upload: saves the photo directly without GPS validation.
  const handleAdminFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid File', description: 'Please select an image.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploading(false);
      onPhotoAdded?.(file_url);
    } catch (err) {
      toast({ title: 'Upload Failed', description: 'Could not upload photo. Please try again.', variant: 'destructive' });
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />

      {canCapture ? (
        <>
          <button
            onClick={() => setShowInstructions(true)}
            disabled={disabled || uploading}
            className="w-full flex flex-col items-center gap-1 py-3 rounded-lg bg-primary/15 border border-primary/40 text-primary font-heading text-sm uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-60"
          >
            {uploading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> <span>Uploading Photo...</span></>
            ) : (
              <><Camera className="w-5 h-5" /> <span>{isVerified ? 'Add Photo' : 'Validate & Add Photo'}</span></>
            )}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            {uploading
              ? 'Uploading photo...'
              : isVerified
                ? 'Take a reference photo from the best vantage point'
                : 'Point your device at the stop, capture a photo, and mark your GPS location'}
          </p>
        </>
      ) : (
        <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-card/30 border border-border/40">
          <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">Photo locked — only an admin can replace this stop's reference photo.</p>
        </div>
      )}

      {isAdmin && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <p className="text-[10px] font-heading uppercase tracking-wider text-amber-400 mb-1.5">Admin Only</p>
          <button
            onClick={() => adminFileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-heading text-xs uppercase tracking-wider hover:bg-amber-500/20 transition-colors disabled:opacity-60"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
            ) : (
              <><Camera className="w-4 h-4" /> {hasPhoto ? 'Change Photo (Admin)' : 'Upload Photo (Admin)'}</>
            )}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-1">
            {hasPhoto ? 'Replace the reference photo without re-validating GPS' : 'Add a reference photo without GPS validation'}
          </p>
          <input
            ref={adminFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAdminFileSelect}
          />
        </div>
      )}

      {showInstructions && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => !uploading && setShowInstructions(false)}
        >
          <div
            className="max-w-sm w-full p-5 rounded-xl border border-primary/30 bg-card space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm uppercase tracking-wider text-primary">
                {isVerified ? 'Add Stop Photo' : 'Validate & Add Photo'}
              </h3>
              {!uploading && (
                <button onClick={() => setShowInstructions(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Point your device at <span className="text-primary font-medium">{stop.name}</span> and capture a photo from the best vantage point. This photo helps other investigators confirm they're at the right location.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/15 border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-60"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
              ) : (
                <><Camera className="w-4 h-4" /> Open Camera</>
              )}
            </button>
            {!isVerified && (
              <button
                onClick={() => { setShowInstructions(false); onValidateOnly?.(); }}
                disabled={uploading}
                className="w-full text-center text-[10px] text-muted-foreground hover:text-primary transition-colors py-1"
              >
                Validate location only (no photo)
              </button>
            )}
            {hasPhoto && (
              <p className="text-[10px] text-amber-400/70 text-center">
                Taking a new photo will replace the existing one.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}