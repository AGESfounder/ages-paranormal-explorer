import { useEffect } from 'react';

// Recover a suspended camera decoder, not the recorder: the charts may continue
// recording while the video element supplies the same camera frame indefinitely.
export default function useSiegCameraPlayback(videoRef, active, setError, setAvailability) {
  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    let disposed = false, pending = false, previousTime = null, changedAt = Date.now();
    let recovered = false;
    const check = async () => {
      const stream = video?.srcObject;
      if (disposed || pending || !stream?.active || document.visibilityState !== 'visible') {
        previousTime = null;
        changedAt = Date.now();
        return;
      }
      const now = Date.now();
      if (video.currentTime !== previousTime) {
        previousTime = video.currentTime;
        changedAt = now;
        recovered = false;
      }
      const stalled = now - changedAt >= 4000;
      if (!video.paused && !stalled) return;
      if (stalled && recovered) {
        setError('The camera is not delivering live frames. The charts are still running, but the camera image is not live. Stop this session and reopen SIEG.');
        return;
      }
      pending = true;
      try {
        if (stalled) { recovered = true; video.srcObject = stream; changedAt = now; }
        video.muted = true;
        await video.play();
      } catch {
        if (!disposed) setError('Camera playback was interrupted. Tap the camera view to resume it.');
      } finally { pending = false; }
    };
    const resume = () => { previousTime = null; changedAt = Date.now(); check(); };
    const onPlaying = () => {
      if (disposed) return;
      setAvailability((value) => ({ ...value, camera: true }));
      setError((value) => /^(Camera playback|Camera access or playback|The live camera|The camera is not delivering)/.test(value) ? '' : value);
    };
    const timer = setInterval(check, 1000);
    video?.addEventListener('pause', check);
    video?.addEventListener('playing', onPlaying);
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('pointerdown', check, { passive: true });
    return () => {
      disposed = true;
      clearInterval(timer);
      video?.removeEventListener('pause', check);
      video?.removeEventListener('playing', onPlaying);
      document.removeEventListener('visibilitychange', resume);
      document.removeEventListener('pointerdown', check);
    };
  }, [active, videoRef, setError, setAvailability]);
}