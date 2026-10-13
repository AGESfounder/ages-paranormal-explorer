import { useEffect } from 'react';

export function configureInlineCameraVideo(video) {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.controls = false;
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  for (const name of ['playsinline', 'webkit-playsinline', 'muted', 'autoplay']) video.setAttribute(name, '');
  video.setAttribute('controlslist', 'nofullscreen noremoteplayback');
}

// Leaving an accidental native fullscreen player can pause the camera decoder
// while the canvas recorder keeps running. Resume that same stream, not a new one.
export default function useInlineCameraPlayback(videoRef, active, setError) {
  useEffect(() => {
    const video = videoRef.current;
    configureInlineCameraVideo(video);
    if (!active || !video) return;
    let disposed = false, pending = false;
    const resume = async () => {
      if (disposed || pending || !video.srcObject?.active || document.visibilityState !== 'visible') return;
      if (video.webkitDisplayingFullscreen && video.webkitExitFullscreen) {
        video.webkitExitFullscreen();
        return;
      }
      if (!video.paused) return;
      pending = true;
      try {
        configureInlineCameraVideo(video);
        await video.play();
      } catch {
        if (!disposed) setError('Live camera playback was interrupted. Tap the camera view to resume it.');
      } finally { pending = false; }
    };
    const onPlaying = () => {
      if (!disposed) setError((value) => value.startsWith('Live camera playback') ? '' : value);
    };
    const timer = setInterval(resume, 1000);
    video.addEventListener('pause', resume);
    video.addEventListener('webkitbeginfullscreen', resume);
    video.addEventListener('webkitendfullscreen', resume);
    video.addEventListener('playing', onPlaying);
    video.parentElement?.addEventListener('pointerdown', resume, { passive: true });
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    return () => {
      disposed = true;
      clearInterval(timer);
      video.removeEventListener('pause', resume);
      video.removeEventListener('webkitbeginfullscreen', resume);
      video.removeEventListener('webkitendfullscreen', resume);
      video.removeEventListener('playing', onPlaying);
      video.parentElement?.removeEventListener('pointerdown', resume);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
    };
  }, [active, videoRef, setError]);
}