import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { needsRecordingExport, prepareRecording } from '@/lib/prepareRecording';

export default function usePreparedRecording(source, seconds, trimMode = 'unknown') {
  const androidTrimMode = Capacitor.getPlatform() === 'android' ? trimMode : 'unknown';
  const [result, setResult] = useState({ source: null, seconds: null, trimMode: 'unknown', attempt: 0, blob: null, error: '' });
  const [request, setRequest] = useState(null);
  const attempt = request && request.source === source && request.seconds === seconds && request.trimMode === androidTrimMode ? request.attempt : 0;
  const needed = !!source && needsRecordingExport(seconds);
  useEffect(() => {
    if (!source || !needed) return;
    let active = true;
    const controller = new AbortController();
    setResult({ source, seconds, trimMode: androidTrimMode, attempt, blob: null, error: '' });
    // A user retry must create a new export of the retained original, not
    // reattach to an earlier cached preparation for the same trim selection.
    prepareRecording(source, seconds, controller.signal, { trimMode: androidTrimMode, forceRetry: attempt > 0 }).then(
      (blob) => { if (active) setResult({ source, seconds, trimMode: androidTrimMode, attempt, blob, error: '' }); },
      (error) => {
        if (!active) return;
        if (error.name === 'AbortError') setRequest({ source, seconds, trimMode: androidTrimMode, attempt: attempt + 1 });
        else setResult({ source, seconds, trimMode: androidTrimMode, attempt, blob: null, error: error.message || 'The recording could not be prepared.' });
      },
    );
    return () => { active = false; controller.abort(); };
  }, [source, seconds, androidTrimMode, needed, attempt]);
  const current = result.source === source && result.seconds === seconds && result.trimMode === androidTrimMode && result.attempt === attempt;
  const blob = needed ? (current ? result.blob : null) : source;
  const error = needed && current ? result.error : '';
  const preparing = needed && !blob && !error;
  const retry = () => {
    if (!needed || preparing) return;
    setRequest({ source, seconds, trimMode: androidTrimMode, attempt: attempt + 1 });
  };
  return { blob, originalBlob: source, preparing, error, retry, retryCount: attempt };
}