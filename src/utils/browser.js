export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Safari, and every iOS browser, plays HLS natively instead of through hls.js.
// Native HLS stalls above 2x.
export function hasNativeHls() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function isMobileDevice(navigatorLike = navigator) {
  if (navigatorLike.userAgentData?.mobile === true) return true;

  const userAgent = navigatorLike.userAgent || '';
  const isIpadOs = /Macintosh/i.test(userAgent) && navigatorLike.maxTouchPoints > 1;

  return isIpadOs
    || /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Opera Mini|Kindle|Silk|PlayBook/i
      .test(userAgent);
}
