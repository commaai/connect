// Match react-player's iPadOS check: MacIntel with touch points.
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
