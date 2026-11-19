import { useCallback, useRef } from 'react';
import { resolveRecordingLocation } from '@/lib/evidenceContext';
import { formatStampDate, formatStampLine, stampRecordFields } from '@/lib/recordingStamp';

/**
 * One stamp per recording session.
 *
 * The date is fixed at the moment the session began and never moves; the clock
 * stays live. The location is resolved once, at the start, with the same rules
 * the journal save uses, so the label burned into the frames and the label on
 * the saved record are the same string. The record's date and time come from
 * the same start moment, so the two can never disagree.
 *
 * The location resolves in the background — a session is never held up waiting
 * for a fix, and a session with no location simply burns no location line.
 */
export default function useRecordingStamp() {
  const startRef = useRef(null);
  const locationRef = useRef(null);

  const beginStamp = useCallback(() => {
    const start = new Date();
    startRef.current = start;
    locationRef.current = null;
    resolveRecordingLocation()
      .then((label) => {
        // Ignore a late answer from a session that has already been replaced.
        if (startRef.current === start) locationRef.current = label;
      })
      .catch(() => {});
  }, []);

  const stampLine = useCallback(() => formatStampLine(startRef.current), []);
  const stampDate = useCallback(() => formatStampDate(startRef.current), []);
  const stampLocation = useCallback(() => locationRef.current, []);
  const stampRecord = useCallback(() => stampRecordFields(startRef.current), []);

  return { beginStamp, stampLine, stampDate, stampLocation, stampRecord };
}