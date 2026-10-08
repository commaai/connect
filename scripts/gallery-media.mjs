// Runs only inside gallery browser contexts, never in the app build or preview.
// Layout captures need a fixed media position, not real decoding or UA loading
// animations. Keep native controls present while simulating a ready, idle video.
export function installGalleryMedia(duration) {
  const media = HTMLMediaElement.prototype;
  const canPlayType = media.canPlayType;
  const src = Object.getOwnPropertyDescriptor(media, 'src');
  media.canPlayType = function (type) {
    if (this.tagName === 'VIDEO' && type === 'application/vnd.apple.mpegurl') return 'probably';
    return canPlayType.call(this, type);
  };
  Object.defineProperty(media, 'src', {
    ...src,
    set(url) {
      if (this.tagName !== 'VIDEO' || !new URL(url, location.href).pathname.endsWith('/qcamera.m3u8')) {
        src.set.call(this, url);
        return;
      }
      // Do not assign a real source: an empty HLS playlist never becomes ready
      // and Chromium's native loading controls cannot be frozen with page CSS.
      Object.defineProperties(this, {
        readyState: { configurable: true, value: HTMLMediaElement.HAVE_ENOUGH_DATA },
        duration: { configurable: true, value: duration },
        play: { configurable: true, value: () => Promise.resolve() },
      });
      queueMicrotask(() => {
        this.dispatchEvent(new Event('loadedmetadata'));
        this.dispatchEvent(new Event('canplay'));
      });
    },
  });
}
