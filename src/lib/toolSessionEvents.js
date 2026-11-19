// A tool announces the moment its own session begins, so the toolkit page can
// bring the running view into sight instead of leaving the user scrolled down at
// the setup controls they just pressed. A plain pub/sub — the tools never need to
// know the page exists, and the page never reaches into a tool's state.
const listeners = new Set();

export function notifyToolSessionStart() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // One listener failing must never break a session that is starting.
    }
  });
}

export function onToolSessionStart(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}