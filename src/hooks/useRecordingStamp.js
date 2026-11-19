import { useCallback, useEffect, useRef } from 'react';
import { resolveRecordingLocation } from '@/lib/evidenceContext';
import { formatStampDate, formatStampLine, stampRecordFields } from '@/lib/recordingStamp';
import { notifyToolSessionStart } from '@/lib/toolSessionEvents';

// Retry schedule for the location, measured after each failed attempt. The
// first attempt is immediate; the rest cover roughly five minutes, so a fix
// that arrives after the session has already started still gets burned in.
const RETRY_DELAYS_MS = [5000, 10000, 15000, 25000, 40000, 60000, 60000, 60000, 60000];

/**
 * One stamp per recording session.
 *
 * The date is fixed at the moment the session began and never moves; the clock
 * stays live. The location keeps resolving in the background until it succeeds
 * — a session is never held up waiting for a fix, and a late fix is still
 * burned in. It uses the journal's own label builder, so the burned label and
 * the saved record carry the same string. The record's date and time come from
 * the same start moment, so the two can never disagree.
 */
export default function useRecordingStamp() {
  const startRef = useRef(null);
  const locationRef = useRef(null);
  const timerRef = useRef(null);

  const stopResolving = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const beginStamp = useCallback(() => {
    const start = new Date();
    startRef.current = start;
    locationRef.current = null;
    stopResolving();
    // This is the moment a tool's session begins, whatever its own start button
    // is called, so the toolkit page can bring the running view into sight.
    notifyToolSessionStart();

    let attempt = 0;
    const attemptLocation = () => {
      // Ignore a late answer from a session that has already been replaced.
      if (startRef.current !== start || locationRef.current) return;
      const retry = () => {
        if (startRef.current !== start || locationRef.current) return;
        if (attempt < RETRY_DELAYS_MS.length) {
          timerRef.current = setTimeout(attemptLocation, RETRY_DELAYS_MS[attempt++]);
        }
      };
      resolveRecordingLocation()
        .then((label) => {
          if (startRef.current !== start) return;
          if (label) locationRef.current = label;
          else retry();
        })
        .catch(retry);
    };
    attemptLocation();
  }, [stopResolving]);

  useEffect(() => stopResolving, [stopResolving]);

  const stampLine = useCallback(() => formatStampLine(startRef.current), []);
  const stampDate = useCallback(() => formatStampDate(startRef.current), []);
  const stampLocation = useCallback(() => locationRef.current, []);
  const stampRecord = useCallback(() => stampRecordFields(startRef.current), []);

  return { beginStamp, stampLine, stampDate, stampLocation, stampRecord };
}