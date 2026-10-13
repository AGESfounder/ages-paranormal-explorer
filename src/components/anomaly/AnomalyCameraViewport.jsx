import React from 'react';

// The real camera stays visible, inline and untappable, so mobile decoding is
// not suspended. Transparent annotations use the same detections as the recorder.
export default function AnomalyCameraViewport({ videoRef, canvasRef, overlayRef, mode, children }) {
  return (
    <div className="relative rounded-lg overflow-hidden bg-background border border-primary/30" style={{ aspectRatio: '4/3' }}>
      <canvas ref={canvasRef} width={640} height={480} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        className={mode === 'contrast' ? 'absolute inset-0 w-full h-full object-cover pointer-events-none' : 'hidden'}
        style={{ filter: 'grayscale(1) sepia(1) saturate(8) hue-rotate(75deg) brightness(1.3)' }}
      />
      <canvas ref={overlayRef} width={640} height={480} className={mode === 'contrast' ? 'absolute inset-0 w-full h-full object-cover pointer-events-none' : 'hidden'} />
      {children}
    </div>
  );
}