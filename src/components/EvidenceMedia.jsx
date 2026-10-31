import React, { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import useSignedMedia from '@/hooks/useSignedMedia';

/**
 * Shows one piece of stored user media.
 *
 * Private media is never rendered from a storage URI: this asks the
 * evidence-media-link function for a short-lived signed URL, which the function
 * only issues after checking that the viewer may see the record. Legacy records
 * that still hold a public URL render that URL directly.
 *
 * `lazy` defers the request until the media is scrolled into view, so a journal
 * with many entries does not mint a link for every row on load.
 */
export default function EvidenceMedia({
  kind = 'evidence',
  recordId,
  mediaType = 'photo',
  legacyUrl,
  className = '',
  alt = '',
  controls = true,
  lazy = true,
}) {
  const holderRef = useRef(null);
  const mediaRef = useRef(null);
  const resumeAtRef = useRef(null);
  const retriedRef = useRef(false);
  const [inView, setInView] = useState(!lazy || !!legacyUrl);

  useEffect(() => {
    if (inView || !lazy) return undefined;
    if (!recordId) return undefined;
    const node = holderRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, lazy, recordId]);

  const { url, expiresAt, reload } = useSignedMedia({ kind, id: recordId, enabled: inView, legacyUrl });

  // A recording longer than the signed link's lifetime would stall the moment
  // the link expires. Renew it shortly before expiry, while it is still
  // playing, and resume from the same position so playback continues instead of
  // restarting. Only recordings that actually outlast their link renew.
  useEffect(() => {
    if (!url || !expiresAt || (mediaType !== 'video' && mediaType !== 'evp')) return undefined;
    const msUntilExpiry = expiresAt - Date.now();
    if (!(msUntilExpiry > 0)) return undefined;

    const timer = setTimeout(() => {
      const el = mediaRef.current;
      if (!el || el.paused || el.ended) return;
      const remainingMs = (el.duration - el.currentTime) * 1000;
      if (!Number.isFinite(remainingMs) || remainingMs <= msUntilExpiry - 60000) return;
      resumeAtRef.current = el.currentTime;
      reload();
    }, Math.max(0, msUntilExpiry - 120000));

    return () => clearTimeout(timer);
  }, [url, expiresAt, mediaType, reload]);

  const handleLoadedMetadata = () => {
    const el = mediaRef.current;
    if (!el || resumeAtRef.current == null) return;
    try {
      el.currentTime = resumeAtRef.current;
    } catch (e) {
      // Seeking is best-effort; playback still continues from the start.
    }
    resumeAtRef.current = null;
    if (el.play) el.play().catch(() => {});
  };

  // A link that expired before its media finished, or a stale cached link,
  // gets one fresh attempt.
  const handleError = () => {
    if (retriedRef.current || !recordId) return;
    retriedRef.current = true;
    reload();
  };

  if (mediaType === 'note') {
    if (!url) return <span ref={holderRef} className={className} />;
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={className || 'text-xs text-primary underline flex items-center gap-1'}
      >
        <FileText className="w-3 h-3" /> View attached file
      </a>
    );
  }

  if (!url) {
    return (
      <div
        ref={holderRef}
        aria-label="Media loading"
        className={`${className} grid place-items-center rounded-lg border border-border/40 bg-card/30`}
      >
        <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
      </div>
    );
  }

  if (mediaType === 'photo') {
    return <img ref={holderRef} src={url} alt={alt} className={className} onError={handleError} />;
  }

  if (mediaType === 'video') {
    return (
      <video
        ref={mediaRef}
        src={url}
        controls={controls}
        playsInline
        className={className}
        onError={handleError}
        onLoadedMetadata={handleLoadedMetadata}
      />
    );
  }

  return (
    <audio
      ref={mediaRef}
      src={url}
      controls={controls}
      className={className}
      onError={handleError}
      onLoadedMetadata={handleLoadedMetadata}
    />
  );
}