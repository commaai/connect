function bindListener(target, event, listener) {
  if (!target?.addEventListener) return null;
  target.addEventListener(event, listener);
  return () => target.removeEventListener(event, listener);
}

export function bindSourceListeners(video, tracks, { onError, onAudio }) {
  const unbind = [
    bindListener(video, 'error', onError),
    bindListener(video, 'loadedmetadata', onAudio),
    bindListener(video, 'canplay', onAudio),
    bindListener(tracks, 'addtrack', onAudio),
    bindListener(tracks, 'removetrack', onAudio),
  ].filter(Boolean);
  return () => { for (const off of unbind) off(); };
}
