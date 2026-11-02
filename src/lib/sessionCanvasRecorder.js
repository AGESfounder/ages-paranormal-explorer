import { startChunkPump, stopChunkPump } from '@/lib/recorderChunkPump';

// SIEG's capture path: the live canvas plus the session's plain microphone,
// one recorder, every chunk in order, and a container-only MIME declaration.
// Only the canvas track belongs to this recorder. Its caller owns the mic.
export default function sessionCanvasRecorder({ canvas, micStream, onFinished, onError }) {
  const useCanvas = !!canvas && typeof canvas.captureStream === 'function';
  const stream = useCanvas ? canvas.captureStream(30) : new MediaStream();
  const picture = stream.getVideoTracks()[0] || null;
  const mic = micStream?.getAudioTracks()[0];
  if (!mic || mic.readyState !== 'live') {
    picture?.stop();
    throw new Error('A live microphone is required to record this session.');
  }
  stream.addTrack(mic);
  const candidates = picture
    ? ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  const mime = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  } catch (error) {
    picture?.stop();
    throw error;
  }
  const chunks = [];
  let pump;
  let requestedStop = false;
  let finished = false;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  recorder.ondataavailable = ({ data }) => { if (data?.size) chunks.push(data); };
  recorder.onerror = () => onError?.('The recording was interrupted. Stop the session to save what was captured.');
  recorder.onstop = () => {
    finished = true;
    stopChunkPump(pump);
    picture?.stop();
    const type = (recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || mime || (picture ? 'video/webm' : 'audio/webm')).split(';')[0].trim();
    const blob = new Blob(chunks, { type });
    // Never append a second recorder's container to this file after an early stop.
    if (!requestedStop) onError?.('The recording ended early. Stop the session and save what was captured, then start a new session.');
    onFinished(blob);
    resolveDone(blob);
  };
  try {
    recorder.start(1000);
    pump = startChunkPump(recorder);
  } catch (error) {
    picture?.stop();
    throw error;
  }
  return {
    requestFrame: () => { if (!finished) picture?.requestFrame?.(); },
    stop: () => {
      requestedStop = true;
      stopChunkPump(pump);
      if (recorder.state !== 'inactive') recorder.stop();
      // onstop follows the final dataavailable; keep inputs alive until then.
      return done;
    },
  };
}