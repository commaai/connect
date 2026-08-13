import { vi } from 'vitest';
import { webrtcMiddleware } from './webrtcMiddleware';
import { webrtcConnectionManager } from './utils/webrtc';
import * as Types from './actions/types';

vi.mock('./utils/webrtc', () => ({
  webrtcConnectionManager: { disconnect: vi.fn() },
}));

function makeStore(dongleId) {
  return { getState: vi.fn(() => ({ dongleId })), dispatch: vi.fn() };
}

describe('webrtcMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disconnects when the dongleId changes across an action', () => {
    const store = makeStore('aaa');
    store.getState.mockReturnValueOnce({ dongleId: 'aaa' }).mockReturnValueOnce({ dongleId: 'bbb' });
    const next = vi.fn();
    webrtcMiddleware(store)(next)({ type: Types.ACTION_APPLY_DESTINATION });
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not disconnect when the dongleId is unchanged', () => {
    const store = makeStore('aaa');
    store.getState.mockReturnValueOnce({ dongleId: 'aaa' }).mockReturnValueOnce({ dongleId: 'aaa' });
    const next = vi.fn();
    webrtcMiddleware(store)(next)({ type: Types.ACTION_UPDATE_DEVICE_ONLINE });
    expect(webrtcConnectionManager.disconnect).not.toHaveBeenCalled();
  });

  it('passes the action through and returns the downstream result', () => {
    const store = makeStore('aaa');
    const next = vi.fn(() => 'result');
    expect(webrtcMiddleware(store)(next)({ type: 'ANY' })).toBe('result');
    expect(next).toHaveBeenCalledWith({ type: 'ANY' });
  });
});
