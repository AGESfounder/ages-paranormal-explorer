import React, { useLayoutEffect } from 'react';

// This is only the frame source. The existing green-and-blue canvas remains
// the visible camera view and the recording surface.
export default function AnomalyCameraSource({ videoRef, visible }) {
  useLayoutEffect(() => {
    const video = videoRef.current;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.controls = false;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('controlslist', 'nofullscreen noremoteplayback');
    const keepInline = () => {
      if (video.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === 'function') video.webkitExitFullscreen();
    };
    const resumeInline = () => {
      if (video.srcObject?.active && video.paused) return video.play();
    };
    video.addEventListener('webkitbeginfullscreen', keepInline);
    video.addEventListener('webkitendfullscreen', resumeInline);
    return () => {
      video.removeEventListener('webkitbeginfullscreen', keepInline);
      video.removeEventListener('webkitendfullscreen', resumeInline);
    };
  }, [videoRef]);

  return <video ref={videoRef} playsInline muted controls={false} disablePictureInPicture disableRemotePlayback className={`absolute inset-0 w-full h-full object-cover ${visible ? 'opacity-100' : 'opacity-0'} pointer-events-none`} />;
}