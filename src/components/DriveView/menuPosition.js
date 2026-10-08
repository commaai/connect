export function menuPosition(anchor, trigger) {
  const anchorEl = anchor?.isConnected ? anchor : trigger;
  return {
    anchorEl,
    anchorReference: anchorEl ? 'anchorEl' : 'anchorPosition',
    anchorPosition: { top: Math.min(window.innerHeight / 2, 400), left: window.innerWidth / 2 },
  };
}
