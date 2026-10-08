// Keep the exact CDN/version previously configured through ReactPlayer.
const HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.4.8/dist/hls.min.js';
let pending;

export function loadHls() {
  if (window.Hls?.version === '1.4.8') return Promise.resolve(window.Hls);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = HLS_URL;
      const cleanup = () => {
        script.onload = null;
        script.onerror = null;
        script.remove();
      };
      script.onload = () => {
        cleanup();
        if (window.Hls) resolve(window.Hls);
        else reject(new Error('HLS player did not load'));
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('Unable to load HLS player'));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      pending = null; // A Retry must make a fresh request after a CDN failure.
      throw error;
    });
  }
  return pending;
}
