import { describe, expect, it, vi, afterEach } from 'vitest';
import { attachSource } from './transport';

const video = () => Object.assign(new EventTarget(), { src: '', load: vi.fn(), pause: vi.fn(), removeAttribute: vi.fn(), getAttribute: vi.fn(() => ''), canPlayType: () => 'maybe' });
afterEach(() => { vi.useRealTimers(); });

describe('transport QA', () => {
  it('Q3-B3-1: canplay must not clear a blocked-play prompt', () => {
    const v = video(); const onStatus = vi.fn();
    const s = attachSource(v, { src: 'a.m3u8', onStatus });
    s.reportError({ name: 'NotAllowedError' });
    v.dispatchEvent(new Event('canplay'));
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ blocked: true }));
  });
  it('Q3-B3-2: a slow seek stall past 15s is not a fatal error', () => {
    vi.useFakeTimers();
    const v = video(); const onStatus = vi.fn();
    attachSource(v, { src: 'a.m3u8', onStatus });
    v.dispatchEvent(new Event('playing'));
    v.dispatchEvent(new Event('waiting'));
    vi.advanceTimersByTime(20000);
    expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
  it('Q3-B3-3: timing fetch failure must not show an error while video plays', async () => {
    const v = video(); const onStatus = vi.fn();
    attachSource(v, { src: 'a.m3u8', onStatus, onTimeline: vi.fn(), fetchPlaylist: () => Promise.reject(new Error('net')) });
    v.dispatchEvent(new Event('playing'));
    await new Promise(r => setTimeout(r, 0));
    expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
  it('bounded: native decode errors reload once then fail', () => {
    const v = video(); const onStatus = vi.fn();
    const s = attachSource(v, { src: 'a.m3u8', onStatus });
    for (let i = 0; i < 5; i++) s.reportError({ code: 3 });
    expect(v.load).toHaveBeenCalledTimes(2); // start + one recovery
  });
  it('destroy then late errors are ignored', () => {
    const v = video(); const onStatus = vi.fn();
    const s = attachSource(v, { src: 'a.m3u8', onStatus }); s.destroy(); onStatus.mockClear();
    s.reportError({ code: 4 }); v.dispatchEvent(new Event('waiting'));
    expect(onStatus).not.toHaveBeenCalled();
  });
});
