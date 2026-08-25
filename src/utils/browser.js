export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().includes('firefox');
}

export function isMobilePhone(navigatorLike = navigator) {
  if (typeof navigatorLike.userAgentData?.mobile === 'boolean') {
    return navigatorLike.userAgentData.mobile;
  }

  return /iPhone|iPod|Android.+Mobile|Windows Phone|IEMobile|Opera Mini/i
    .test(navigatorLike.userAgent || '');
}
