import { vi } from 'vitest';
import { push, replace } from 'connected-react-router';

import { navigate, selectDevice, selectTimeFilter } from './index';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

vi.mock('connected-react-router', async () => {
  const actual = await vi.importActual('connected-react-router');
  return {
    ...actual,
    push: vi.fn((href) => ({ type: 'push', href })),
    replace: vi.fn((href) => ({ type: 'replace', href })),
  };
});

const DONGLE = 'statedongle000000';

function run(action, state) {
  const dispatch = (next) => (typeof next === 'function' ? next(dispatch, () => state) : next);
  action(dispatch, () => state);
}

describe('navigate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when the URL is already showing', () => {
    run(navigate(`/${DONGLE}?from=1&to=2`), {
      router: { location: { pathname: `/${DONGLE}`, search: '?from=1&to=2' } },
    });
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('pushes, or replaces when asked', () => {
    run(navigate(`/${DONGLE}/prime`), {
      router: { location: { pathname: `/${DONGLE}`, search: '' } },
    });
    expect(push).toHaveBeenCalledWith(`/${DONGLE}/prime`);

    run(navigate(`/${DONGLE}/log`, true), {
      router: { location: { pathname: `/${DONGLE}`, search: '' } },
    });
    expect(replace).toHaveBeenCalledWith(`/${DONGLE}/log`);
  });

  it('keeps the dashboard range when staying on a device and drops it when switching', () => {
    run(selectDevice(DONGLE), {
      dongleId: DONGLE,
      router: { location: { pathname: `/${DONGLE}/log`, search: '?from=1&to=2&settings=abc' } },
    });
    expect(push).toHaveBeenCalledWith(`/${DONGLE}?from=1&to=2`);

    run(selectDevice('otherdevice00000'), {
      dongleId: DONGLE,
      router: { location: { pathname: `/${DONGLE}`, search: '?from=1&to=2' } },
    });
    expect(push).toHaveBeenCalledWith('/otherdevice00000');
  });

  it('writes a filter and closes the picker in the same URL', () => {
    run(selectTimeFilter(10, 20), {
      router: { location: { pathname: `/${DONGLE}`, search: '?filter=1&pair=abc' } },
    });
    expect(push).toHaveBeenCalledWith(`/${DONGLE}?pair=abc&from=10&to=20`);
  });
});
