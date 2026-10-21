import { useEffect, useState } from 'react';
import { needsRecordingExport, prepareRecording } from '@/lib/prepareRecording';

export default function usePreparedRecording(source, seconds) {
  const [result, setResult] = useState({ source: null, seconds: null, blob: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const needed = !!source && needsRecordingExport(seconds);
  useEffect(() => {
    if (!source || !needed) return;
    let active = true;
    const controller = new AbortController();
    setResult({ source, seconds, blob: null, error: '' });
    prepareRecording(source, seconds, controller.signal).then(
      (blob) => { if (active) setResult({ source, seconds, blob, error: '' }); },
      (error) => {
        if (!active) return;
        if (error.name === 'AbortError') setAttempt((value) => value + 1);
        else setResult({ source, seconds, blob: null, error: error.message || 'The recording could not be prepared.' });
      },
    );
    return () => { active = false; controller.abort(); };
  }, [source, seconds, needed, attempt]);
  const current = result.source === source && result.seconds === seconds;
  const blob = needed ? (current ? result.blob : null) : source;
  const error = needed && current ? result.error : '';
  return { blob, originalBlob: source, preparing: needed && !blob && !error, error, retry: () => setAttempt((value) => value + 1) };
}