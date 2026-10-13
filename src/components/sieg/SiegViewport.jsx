import React, { useLayoutEffect } from 'react';
import { SIEG_W, SIEG_H, drawSiegFrame } from '@/lib/siegDisplay';

// Like the working standalone camera, the source video supplies frames only.
// The visible canvas is also the recording, so no raw player covers the scan.
export default function SiegViewport({ videoRef, canvasRef, sessionName, conditions, minutes }) {
  useLayoutEffect(() => {
    const snapshot = { sessionName, conditions, remaining: minutes * 60, statusText: 'STARTING' };
    drawSiegFrame(canvasRef.current.getContext('2d'), canvasRef.current, snapshot);
  }, []);

  return (
    <div className="relative rounded-lg overflow-hidden bg-background border border-border/40" style={{ aspectRatio: `${SIEG_W}/${SIEG_H}` }}>
      <video ref={videoRef} playsInline muted controls={false} disablePictureInPicture className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none" />
      <canvas ref={canvasRef} width={SIEG_W} height={SIEG_H} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
}