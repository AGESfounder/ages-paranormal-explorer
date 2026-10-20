import React, { useEffect, useMemo } from 'react';

export default function RecordingPreview({ blob, className = 'w-full rounded', maxHeight = 180 }) {
  const src = useMemo(() => blob ? URL.createObjectURL(blob) : null, [blob]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  if (!src) return null;
  return blob.type.startsWith('audio')
    ? <audio src={src} controls className={className} />
    : <video src={src} controls playsInline className={className} style={{ maxHeight }} />;
}