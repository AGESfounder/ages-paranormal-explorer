import { base44 } from '@/api/base44Client';

/**
 * Reads the real duration, in whole seconds, of a recorded file.
 *
 * This is the length of the media actually being saved (after any trim), not
 * the session length, because a link's lifetime is derived from it. Files from
 * MediaRecorder often report an infinite duration until they are seeked past
 * their end, so that is the fallback before giving up.
 *
 * Returns null when the file is not timed media or its duration can't be read.
 */
export function readMediaDuration(file) {
  const type = file?.type || '';
  const isVideo = type.startsWith('video/');
  if (!isVideo && !type.startsWith('audio/')) return Promise.resolve(null);

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(isVideo ? 'video' : 'audio');
    el.preload = 'metadata';

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.onloadedmetadata = null;
      el.ontimeupdate = null;
      el.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? Math.round(value) : null);
    };

    const timer = setTimeout(() => finish(el.duration), 8000);

    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        finish(el.duration);
        return;
      }
      // Duration still unknown — seeking beyond the end forces the browser to
      // resolve it from the media's own timeline.
      el.ontimeupdate = () => finish(el.duration);
      try {
        el.currentTime = 1e7;
      } catch (e) {
        finish(null);
      }
    };
    el.onerror = () => finish(null);
    el.src = url;
  });
}

/**
 * Stores user media in private storage and reports both what was stored and how
 * long it plays.
 *
 * The returned file_uri is the only handle to the file and must be written to a
 * record whose field is unreadable by clients. A viewing link is minted later,
 * on demand, by the evidence-media-link function.
 */
export async function uploadPrivateMedia(file) {
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
  const duration_seconds = await readMediaDuration(file);
  return { file_uri, duration_seconds };
}