import { useCallback, useRef, useState } from 'react';

// Shared MediaRecorder lifecycle for the canvas-based sweeper tools (Terms,
// Alphabet, Yes/No/IDK). All three recorded a <canvas> + mic into a
// MediaRecorder and assembled the blob on stop, but the recorder could
// silently die a few seconds in (audio track ending when the Web Audio
// AudioContext suspends on iOS, or the canvas track starving under WKWebView
// timer throttling) while the on-screen REC timer kept counting — so a 20s
// session saved only the first 3-5s.
//
// This hook fixes that with:
//   1. Hidden diagnostics — onerror, per-track onended, and onstop timing are
//      logged to the console with a [SweeperRec] prefix so a TestFlight run
//      shows exactly when/why the recorder stopped vs. the session timer.
//   2. AudioContext heartbeat — resumes the Web Audio context every 3s while
//      recording so the mixed-audio destination track does not end (the
//      primary suspected cause on iOS).
//   3. Auto-restart — if onstop fires without a user-initiated stop, a fresh
//      recorder is spun up on a new canvas stream + mic and chunks keep
//      accumulating into the same buffer, so the rest of the session is
//      captured instead of lost.
//
// The hook owns the recorder/chunk/audio refs and the videoBlob state so the
// fix lives in exactly one place. Components pass their canvasRef, the
// useGhostVoice attachMicToRecording + resumeContext callbacks, and their
// setSensorError, and call startRecording()/stopRecording()/cleanup().

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

function diag(level, msg, data) {
  try {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    const suffix = data !== undefined ? ` ${JSON.stringify(data)}` : '';
    fn(`[SweeperRec] ${msg}${suffix}`);
  } catch {}
}

export default function useSweeperRecorder({
  canvasRef,
  attachMicToRecording,
  resumeAudioContext,
  setSensorError,
  componentName = 'Sweeper',
}) {
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const canvasStreamRef = useRef(null);
  const mimeTypeRef = useRef('');
  const userStoppedRef = useRef(false);
  const heartbeatRef = useRef(null);
  const restartCountRef = useRef(0);
  const startedAtRef = useRef(0);
  const [videoBlob, setVideoBlob] = useState(null);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
  }, []);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatRef.current = setInterval(async () => {
      try {
        if (resumeAudioContext) await resumeAudioContext();
      } catch {}
      diag('info', `${componentName} heartbeat`, {
        elapsed: Math.round((Date.now() - startedAtRef.current) / 1000),
        chunks: videoChunksRef.current.length,
        recorderState: mediaRecorderRef.current?.state ?? 'none',
      });
    }, 3000);
  }, [resumeAudioContext, componentName, stopHeartbeat]);

  const stopTracks = useCallback(() => {
    if (canvasStreamRef.current) {
      try { canvasStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      canvasStreamRef.current = null;
    }
    if (audioStreamRef.current) {
      try { audioStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      audioStreamRef.current = null;
    }
  }, []);

  // Spin up a fresh MediaRecorder on a new canvas stream + mic. Used for both
  // the initial recording and auto-restarts. Chunks always accumulate into
  // the same videoChunksRef so the final blob spans the whole session.
  const spinup = useCallback(async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      audioStreamRef.current = audioStream;
      await new Promise((r) => setTimeout(r, 150));
      if (!canvasRef.current || typeof canvasRef.current.captureStream !== 'function') {
        setSensorError?.('Recording not supported in this browser. The session still runs — you just won\'t get a video file.');
        return false;
      }
      const canvasStream = canvasRef.current.captureStream(30);
      canvasStreamRef.current = canvasStream;
      // Prefer the Web Audio mixed track (mic + dictated speech) when it is
      // still live; on a restart after the AudioContext suspended the mixed
      // track is ended, so fall back to the raw mic track (the TTS is still
      // captured acoustically — see the echo-cancellation disable comment).
      let audioTrack = null;
      try {
        const mixed = attachMicToRecording ? attachMicToRecording(audioStream) : null;
        if (mixed && mixed.readyState !== 'ended') audioTrack = mixed;
      } catch {}
      if (!audioTrack) audioTrack = audioStream.getAudioTracks()[0] || null;
      if (audioTrack) canvasStream.addTrack(audioTrack);

      const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      mimeTypeRef.current = mimeType;
      const mr = new MediaRecorder(canvasStream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
      mr.onerror = (e) => {
        diag('error', `${componentName} recorder onerror`, {
          elapsed: Math.round((Date.now() - startedAtRef.current) / 1000),
          error: e?.error?.name || 'unknown',
          chunks: videoChunksRef.current.length,
        });
      };
      // Log if either recorded track ends early — the direct signal that the
      // recorder is about to auto-stop.
      const onTrackEnded = (which) => (e) => {
        diag('warn', `${componentName} ${which} track ended`, {
          elapsed: Math.round((Date.now() - startedAtRef.current) / 1000),
          readyState: e?.target?.readyState,
        });
      };
      canvasStream.getVideoTracks().forEach((t) => t.addEventListener('ended', onTrackEnded('video')));
      if (audioTrack) audioTrack.addEventListener('ended', onTrackEnded('audio'));

      mr.onstop = () => {
        if (userStoppedRef.current) {
          // User-initiated stop — assemble the final blob from every chunk
          // collected across the whole session (including restarts).
          const blob = new Blob(videoChunksRef.current, { type: mimeTypeRef.current || 'video/webm' });
          diag('info', `${componentName} recorder stopped (user)`, {
            elapsed: Math.round((Date.now() - startedAtRef.current) / 1000),
            chunks: videoChunksRef.current.length,
            blobSize: blob.size,
          });
          setVideoBlob(blob);
          stopTracks();
          return;
        }
        // Auto-stop (track ended / WebKit fragility) while the session is
        // still running — restart a fresh recorder so the rest of the
        // session is captured. Chunks already collected are preserved.
        diag('warn', `${componentName} recorder auto-stopped — restarting`, {
          elapsed: Math.round((Date.now() - startedAtRef.current) / 1000),
          chunks: videoChunksRef.current.length,
          restart: restartCountRef.current + 1,
        });
        stopTracks();
        restartCountRef.current += 1;
        // Spin up asynchronously; failure is non-fatal (session continues).
        spinup().catch((e) => diag('error', `${componentName} restart spinup failed`, { msg: e?.message }));
      };

      mr.start(1000);
      return true;
    } catch (e) {
      setSensorError?.('Microphone access denied. Grant permission to record the session.');
      diag('error', `${componentName} spinup failed`, { msg: e?.message });
      return false;
    }
  }, [canvasRef, attachMicToRecording, setSensorError, componentName, stopTracks]);

  const startRecording = useCallback(async () => {
    userStoppedRef.current = false;
    restartCountRef.current = 0;
    videoChunksRef.current = [];
    setVideoBlob(null);
    startedAtRef.current = Date.now();
    diag('info', `${componentName} recording started`);
    const ok = await spinup();
    if (ok) startHeartbeat();
    return ok;
  }, [spinup, startHeartbeat, componentName]);

  // User-initiated stop (Stop Session button). Flags the stop so the onstop
  // handler builds the blob instead of restarting.
  const stopRecording = useCallback(() => {
    userStoppedRef.current = true;
    stopHeartbeat();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
  }, [stopHeartbeat]);

  // Unmount / teardown — never restarts.
  const cleanup = useCallback(() => {
    userStoppedRef.current = true;
    stopHeartbeat();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    stopTracks();
  }, [stopHeartbeat, stopTracks]);

  return { videoBlob, setVideoBlob, startRecording, stopRecording, cleanup };
}