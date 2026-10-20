import { audioAcquire, audioRelease } from '@/lib/hauntedAudio';

function waitFor(media, event, signal, action) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); media.removeEventListener(event, done); media.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted); };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('This recording could not be decoded for trimming. The original is still available under Full.')); };
    const aborted = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(failed, 20000);
    media.addEventListener(event, done, { once: true });
    media.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted(); else action?.();
  });
}

// Re-record decoded frames, rather than splicing incompatible container fragments.
// iOS uses AVFoundation instead; this local path supports browsers and Android.
export async function exportBrowserRecording(blob, seconds, signal) {
  const hold = audioAcquire('Preparing recording');
  const media = document.createElement(blob.type.startsWith('audio') ? 'audio' : 'video');
  media._agesSilentMedia = true;
  media.playsInline = true;
  media.preload = 'auto';
  media.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0;';
  const url = URL.createObjectURL(blob);
  let context, stream, recorder, frame, timer;
  document.body.appendChild(media);
  try {
    await waitFor(media, 'loadedmetadata', signal, () => { media.src = url; media.load(); });
    if (!Number.isFinite(media.duration)) {
      await waitFor(media, 'durationchange', signal, () => { media.currentTime = 1e10; });
    }
    const duration = media.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('The recording duration could not be read. Select Full to keep the original.');
    if (duration <= seconds) return blob;
    await waitFor(media, 'seeked', signal, () => { media.currentTime = Math.max(0, duration - seconds); });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    context = new Ctx();
    await context.resume();
    const destination = context.createMediaStreamDestination();
    context.createMediaElementSource(media).connect(destination);
    stream = new MediaStream(destination.stream.getAudioTracks());
    let paint;
    if (!blob.type.startsWith('audio')) {
      const canvas = document.createElement('canvas');
      canvas.width = media.videoWidth; canvas.height = media.videoHeight;
      const ctx = canvas.getContext('2d');
      const picture = canvas.captureStream(30).getVideoTracks()[0];
      stream.addTrack(picture);
      paint = () => { ctx.drawImage(media, 0, 0, canvas.width, canvas.height); picture.requestFrame?.(); frame = requestAnimationFrame(paint); };
      paint();
    }
    const candidates = blob.type.startsWith('audio') ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'] : ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks = [];
    const result = new Promise((resolve, reject) => {
      const abort = () => { reject(new DOMException('Cancelled', 'AbortError')); if (recorder.state !== 'inactive') recorder.stop(); };
      signal?.addEventListener('abort', abort, { once: true });
      recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
      recorder.onerror = () => { signal?.removeEventListener('abort', abort); reject(new Error('The clip could not be prepared. The full original has not been changed.')); };
      recorder.onstop = () => {
        signal?.removeEventListener('abort', abort);
        const finished = new Blob(chunks, { type: recorder.mimeType || mimeType || blob.type });
        if (finished.size) resolve(finished); else reject(new Error('No clip was produced. Select Full to keep the original.'));
      };
      const finish = () => { if (recorder.state !== 'inactive') recorder.stop(); };
      media.onended = finish;
      timer = setTimeout(() => { reject(new Error('Clip preparation took too long. Select Full to keep the original.')); finish(); }, (seconds + 15) * 1000);
      recorder.start();
      media.play().catch((error) => { reject(error); finish(); });
      if (signal?.aborted) abort();
    });
    return await result;
  } finally {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    media.pause();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    if (context && context.state !== 'closed') await context.close().catch(() => {});
    media.removeAttribute('src'); media.load(); media.remove();
    URL.revokeObjectURL(url);
    audioRelease(hold);
  }
}