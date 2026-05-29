export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().includes('firefox');
}
