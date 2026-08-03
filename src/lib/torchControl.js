// Turns the device camera torch (flashlight) on/off for a MediaStream's video
// track. Only supported on some mobile browsers; fails silently otherwise.

export async function enableTorch(stream) {
  try {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps && 'torch' in caps) {
      await track.applyConstraints({ advanced: [{ torch: true }] });
      return true;
    }
    return false;
  } catch { return false; }
}

export function disableTorch(stream) {
  try {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps && 'torch' in caps) {
      track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
    }
  } catch {}
}