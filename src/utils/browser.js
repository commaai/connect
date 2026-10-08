// iPadOS sends a desktop Safari user agent, so a Mac reporting touch points is
// the only signal left. react-player decides native HLS against hls.js the same
// way, and the video path depends on agreeing with it.
export function isIos(navigatorLike = navigator) {
  const { userAgent = '', platform, maxTouchPoints } = navigatorLike;
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function isMobileDevice(navigatorLike = navigator) {
  if (navigatorLike.userAgentData?.mobile === true) return true;

  return isIos(navigatorLike)
    || /Android|Windows Phone|IEMobile|Opera Mini|Kindle|Silk|PlayBook/i
      .test(navigatorLike.userAgent || '');
}
