import { useEffect } from 'react';

// Shared by SIEG and the standalone camera. Resume without replacing the stream.
export default function useInlineCameraPlayback(videoRef, active, setError, setAvailability) {
  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    let disposed = false, pending = false;
    if (video) {
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.controls = false;
      video.disablePictureInPicture = true;
    }
    const check = async () => {
      if (disposed || pending || !video?.srcObject?.active || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
        if (video.paused) { video.muted = true; await video.play(); }
      } catch {
        if (!disposed) setError('Camera playback was interrupted. Tap the camera view to resume it.');
      } finally { pending = false; }
    };
    const resume = () => check();
    const onPlaying = () => {
      if (disposed) return;
      setAvailability?.((value) => ({ ...value, camera: true }));
      setError((value) => /^(Camera playback|Camera access or playback|The live camera|The camera is not delivering)/.test(value) ? '' : value);
    };
    const timer = setInterval(check, 1000);
    const events = [['pause', check], ['webkitbeginfullscreen', check], ['webkitendfullscreen', check], ['playing', onPlaying]];
    events.forEach(([event, handler]) => video?.addEventListener(event, handler));
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('pointerdown', check, { passive: true });
    return () => {
      disposed = true;
      clearInterval(timer);
      events.forEach(([event, handler]) => video?.removeEventListener(event, handler));
      document.removeEventListener('visibilitychange', resume);
      document.removeEventListener('pointerdown', check);
    };
  }, [active, videoRef, setError, setAvailability]);
}