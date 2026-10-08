// Script load events are browser primitive mechanics, not media evidence.
afterEach(() => { delete window.Hls; });

it('shares the pinned SDK request and retries after a failed script download', async () => {
  vi.resetModules();
  const { loadHls } = await import('./hls');
  const first = loadHls();
  expect(loadHls()).toBe(first);
  const script = document.head.querySelector('script[src*="hls.js@1.4.8"]');
  expect(script.src).toBe('https://cdn.jsdelivr.net/npm/hls.js@1.4.8/dist/hls.min.js');
  script.dispatchEvent(new Event('error'));
  await expect(first).rejects.toThrow('Unable to load HLS player');
  expect(document.head.contains(script)).toBe(false);
  const retry = loadHls();
  const next = document.head.querySelector('script[src*="hls.js@1.4.8"]');
  window.Hls = { version: '1.4.8' };
  next.dispatchEvent(new Event('load'));
  expect(await retry).toBe(window.Hls);
  expect(document.head.contains(next)).toBe(false);
  expect(await loadHls()).toBe(window.Hls);
});
