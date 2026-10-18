// Local file download from a Blob — no network, no upload. Used by the
// "Save to Device" evidence option so recordings can be kept during field
// investigations with poor or no cell service, then uploaded to the Journal
// later once back in range.
export function saveBlobToDevice(blob, filename) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function buildDeviceFilename(prefix, blob) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  let ext = 'webm';
  if (blob?.type?.includes('mp4')) ext = 'mp4';
  else if (blob?.type?.includes('audio')) ext = 'webm';
  return `${prefix}_${stamp}.${ext}`;
}