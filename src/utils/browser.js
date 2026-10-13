// iPadOS Safari presents itself as a Mac
const isIpadOs = ({ userAgent = '', maxTouchPoints }) => /Macintosh/i.test(userAgent) && maxTouchPoints > 1;

export function isIos(navigatorLike = navigator) {
  return /iphone|ipad|ipod/i.test(navigatorLike.userAgent || '') || isIpadOs(navigatorLike);
}

export function isMobileDevice(navigatorLike = navigator) {
  if (navigatorLike.userAgentData?.mobile === true) return true;

  return isIpadOs(navigatorLike)
    || /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Opera Mini|Kindle|Silk|PlayBook/i
      .test(navigatorLike.userAgent || '');
}
