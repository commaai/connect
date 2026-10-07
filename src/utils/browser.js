export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// iPhone Safari has no MediaSource, so hls.js can't run there and HLS plays natively instead
export function playsHlsNatively() {
  return !window.MediaSource && Boolean(document.createElement('video').canPlayType('application/vnd.apple.mpegurl'));
}

export function isMobileDevice(navigatorLike = navigator) {
  if (navigatorLike.userAgentData?.mobile === true) return true;

  const userAgent = navigatorLike.userAgent || '';
  const isIpadOs = /Macintosh/i.test(userAgent) && navigatorLike.maxTouchPoints > 1;

  return isIpadOs
    || /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Opera Mini|Kindle|Silk|PlayBook/i
      .test(userAgent);
}
