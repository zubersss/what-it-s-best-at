// Phone niceties: fullscreen with landscape lock, and keeping the screen awake.
// Both need a tap to be allowed, so they are called from button handlers.
let wake = null, wanted = false;

export async function keepAwake() {
  wanted = true;
  try { if (!wake || wake.released) wake = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
}

// The browser drops the wake lock whenever the page is hidden: take it again on return.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (wanted && document.visibilityState === 'visible') keepAwake(); });
}

// Enters fullscreen and locks landscape. With toggle = true a second call leaves it.
export async function immersive(toggle = false) {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    else if (toggle) { await document.exitFullscreen(); return; }
    await screen.orientation?.lock?.('landscape');
  } catch { /* not allowed on this browser: ignore */ }
}
