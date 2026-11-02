import { useCallback, useEffect, useRef, useState } from 'react';
import sessionCanvasRecorder from '@/lib/sessionCanvasRecorder';

// All six standalone tools use SIEG's plain-mic/canvas capture and full-file
// preparation path. Painting and frame delivery share the same animation tick.
export default function useSweeperRecorder(options) {
  const config = useRef(options);
  config.current = options;
  const state = useRef({ take: null, mic: null, generation: 0, starting: false, finishing: null });
  const mounted = useRef(true);
  const frame = useRef(null);
  const heartbeat = useRef(null);
  const [videoBlob, setVideoBlob] = useState(null);
  const stopFrames = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const startFrames = useCallback((draw) => {
    stopFrames();
    const paint = () => {
      draw();
      state.current.take?.requestFrame();
      frame.current = requestAnimationFrame(paint);
    };
    frame.current = requestAnimationFrame(paint);
  }, [stopFrames]);
  const stopRecording = useCallback(() => {
    const current = state.current;
    current.generation += 1; // Cancels microphone permission/startup still pending.
    if (current.finishing) return current.finishing;
    clearInterval(heartbeat.current);
    heartbeat.current = null;
    const take = current.take;
    const mic = current.mic;
    current.finishing = (take ? take.stop() : Promise.resolve(null)).finally(() => {
      stopFrames();
      mic?.getTracks().forEach((track) => track.stop());
      if (current.take === take) current.take = null;
      if (current.mic === mic) current.mic = null;
      current.finishing = null;
    });
    return current.finishing;
  }, [stopFrames]);
  const startRecording = useCallback(async () => {
    const current = state.current;
    if (current.starting || current.finishing || current.take) return false;
    current.starting = true;
    const generation = ++current.generation;
    let ownedMic = null;
    try {
      let micStream = config.current.micStreamRef?.current;
      if (!micStream) {
        ownedMic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        });
        micStream = ownedMic;
      }
      if (!mounted.current || generation !== current.generation) {
        ownedMic?.getTracks().forEach((track) => track.stop());
        return false;
      }
      current.mic = ownedMic;
      setVideoBlob(null);
      current.take = sessionCanvasRecorder({
        canvas: config.current.canvasRef.current,
        micStream,
        onFinished: (blob) => { if (mounted.current) setVideoBlob(blob); },
        onError: (message) => { if (mounted.current) config.current.setSensorError?.(message); },
      });
      // Resume analysis/cue playback without routing its generated destination
      // into the recording or awaiting a suspended audio engine.
      heartbeat.current = setInterval(() => { config.current.resumeAudioContext?.()?.catch?.(() => {}); }, 1500);
      return true;
    } catch (error) {
      ownedMic?.getTracks().forEach((track) => track.stop());
      current.mic = null;
      if (mounted.current && generation === current.generation) {
        config.current.setSensorError?.('Recording could not start. Check microphone permission and try again.');
      }
      return false;
    } finally {
      current.starting = false;
    }
  }, []);
  const cleanup = useCallback(() => { stopRecording(); }, [stopRecording]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cleanup(); };
  }, [cleanup]);
  return { videoBlob, setVideoBlob, startRecording, stopRecording, cleanup, startFrames, stopFrames };
}