export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isMobile() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().includes('firefox');
}

export function isChrome() {
  return /chrome/i.test(navigator.userAgent) && !/edg/i.test(navigator.userAgent);
}
