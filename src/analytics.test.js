import { vi } from 'vitest';
import { analyticsMiddleware } from './analytics';
import { restartLoop, seek } from './timeline/playback';

vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => false } }));
// utils reaches the store, which imports this middleware: avoid the cycle.
vi.mock('./utils', () => ({ deviceIsOnline: () => true }));

describe('playback analytics', () => {
  it('counts seeks the viewer makes but not automatic clip restarts', () => {
    globalThis.gtag = vi.fn();
    const state = { zoom: { start: 0, end: 10000 }, offset: 0, desiredPlaySpeed: 1 };
    const dispatch = analyticsMiddleware({ getState: () => state })(() => {});
    dispatch(restartLoop(0));
    expect(gtag).not.toHaveBeenCalledWith('event', 'video_seek', expect.anything());
    dispatch(seek(5000));
    expect(gtag).toHaveBeenCalledWith('event', 'video_seek', expect.anything());
  });
});
