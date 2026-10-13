import React, { useLayoutEffect } from 'react';
import { SIEG_W, SIEG_H, SIEG_CAMERA_Y, SIEG_CAMERA_H, drawSiegFrame, drawSiegCameraOverlay } from '@/lib/siegDisplay';

// The actual camera video stays opaque and visible. Only its annotations are
// layered over it; hiding the source video can suspend mobile video decoding.
// The complete canvas underneath still records camera + annotations + charts.
export default function SiegViewport({ videoRef, canvasRef, overlayRef, sessionName, conditions, minutes }) {
  useLayoutEffect(() => {
    const snapshot = { sessionName, conditions, remaining: minutes * 60, statusText: 'STARTING' };
    drawSiegFrame(canvasRef.current.getContext('2d'), canvasRef.current, snapshot);
    drawSiegCameraOverlay(overlayRef.current.getContext('2d'), snapshot, null);
  }, []);

  return (
    <div className="relative rounded-lg overflow-hidden bg-background border border-border/40" style={{ aspectRatio: `${SIEG_W}/${SIEG_H}` }}>
      <canvas ref={canvasRef} width={SIEG_W} height={SIEG_H} className="absolute inset-0 w-full h-full" />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute left-0 w-full object-contain bg-background pointer-events-none"
        style={{ top: `${SIEG_CAMERA_Y / SIEG_H * 100}%`, height: `${SIEG_CAMERA_H / SIEG_H * 100}%` }}
      />
      <canvas ref={overlayRef} width={SIEG_W} height={SIEG_H} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
}