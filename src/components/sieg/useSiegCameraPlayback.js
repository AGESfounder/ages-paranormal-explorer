import { useEffect } from 'react';

// Resume the existing inline camera after interruption. Do not periodically
// reattach its stream: that resets the decoder even while recording continues.
export default function useSiegCameraPlayback(videoRef, active, setError, setAvailability) {
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
        if (video.paused) {
          video.muted = true;
          await video.play();
        }
      } catch {
        if (!disposed) setError('Camera playback was interrupted. Tap the camera view to resume it.');
      } finally { pending = false; }
    };
    const resume = () => check();
    const onPlaying = () => {
      if (disposed) return;
      setAvailability((value) => ({ ...value, camera: true }));
      setError((value) => /^(Camera playback|Camera access or playback|The live camera|The camera is not delivering)/.test(value) ? '' : value);
    };
    const timer = setInterval(check, 1000);
    video?.addEventListener('pause', check);
    video?.addEventListener('webkitbeginfullscreen', check);
    video?.addEventListener('webkitendfullscreen', check);
    video?.addEventListener('playing', onPlaying);
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('pointerdown', check, { passive: true });
    return () => {
      disposed = true;
      clearInterval(timer);
      video?.removeEventListener('pause', check);
      video?.removeEventListener('webkitbeginfullscreen', check);
      video?.removeEventListener('webkitendfullscreen', check);
      video?.removeEventListener('playing', onPlaying);
      document.removeEventListener('visibilitychange', resume);
      document.removeEventListener('pointerdown', check);
    };
  }, [active, videoRef, setError, setAvailability]);
}