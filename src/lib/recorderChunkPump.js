// iOS WKWebView ignores MediaRecorder.start(timeslice) — it buffers the whole
// recording and delivers one single chunk at stop, which makes client-side
// trimming impossible (one chunk = the whole recording, so "last 30 seconds"
// is the entire session). requestData() forces a dataavailable event with
// whatever is buffered so far, so calling it on a timer gives us the
// periodic chunks the trim logic needs — even on iOS, where the timeslice
// parameter alone does nothing.
//
// Each recorder still calls mr.start(1000) for the platforms that honour it;
// this pump is the reliable cross-platform backstop that makes the chunks
// actually arrive.

export function startChunkPump(mr, intervalMs = 1000) {
  if (!mr || typeof mr.requestData !== 'function') return null;
  return setInterval(() => {
    if (mr.state === 'recording') {
      try { mr.requestData(); } catch { /* recorder not ready to flush */ }
    }
  }, intervalMs);
}

export function stopChunkPump(id) {
  if (id) { clearInterval(id); }
}