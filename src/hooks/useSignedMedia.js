import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Signed links are deliberately short-lived, so they are cached in memory only,
// for the life of the page, and never written to storage.
const cache = new Map();
const REFRESH_MARGIN_MS = 60000;
const keyOf = (kind, id) => `${kind}:${id}`;

/**
 * Asks the backend for a viewing link. The function checks the caller's
 * permission against the record and returns a URL that expires on its own.
 */
export async function fetchSignedMedia(kind, id, { force = false } = {}) {
  const key = keyOf(kind, id);
  const cached = cache.get(key);
  if (!force && cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) return cached;

  const response = await base44.functions.invoke('evidence-media-link', { kind, id });
  const data = response?.data || {};
  if (!data.url) throw new Error(data.error || 'This media is not available.');
  const entry = {
    url: data.url,
    expiresAt: Date.now() + (Number(data.expires_in) || 900) * 1000,
  };
  cache.set(key, entry);
  return entry;
}

// Mounted viewers listen here so a record whose media was replaced (a stop
// photo) drops the stale link and asks for the new one immediately, instead of
// showing the previous file until the page reloads.
const listeners = new Set();

/** Forget a record's link — used when its media is deleted or replaced. */
export function invalidateSignedMedia(kind, id) {
  const key = keyOf(kind, id);
  cache.delete(key);
  listeners.forEach((notify) => notify(key));
}

/**
 * Resolves the URL for one record's media. A legacy public URL (file_url,
 * verification_photo_url) is used as-is; anything stored privately is minted on
 * demand, and only once the caller can actually see it.
 */
export default function useSignedMedia({ kind = 'evidence', id, enabled = true, legacyUrl }) {
  const [state, setState] = useState(() => (legacyUrl ? { url: legacyUrl, expiresAt: null } : null));
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (legacyUrl) {
      setState({ url: legacyUrl, expiresAt: null });
      return undefined;
    }
    if (!enabled || !id) return undefined;

    let cancelled = false;
    fetchSignedMedia(kind, id, { force: attempt > 0 })
      .then((entry) => {
        if (cancelled) return;
        setState(entry);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, id, enabled, legacyUrl, attempt]);

  // This record's media was replaced: refetch instead of showing the old file.
  useEffect(() => {
    const key = keyOf(kind, id);
    const notify = (changed) => { if (changed === key) setAttempt((n) => n + 1); };
    listeners.add(notify);
    return () => { listeners.delete(notify); };
  }, [kind, id]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { url: state?.url || null, expiresAt: state?.expiresAt || null, failed, reload };
}