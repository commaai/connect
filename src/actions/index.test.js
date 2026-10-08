import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { openDeviceSettings, pushTimelineRange, showPage } from './index';
import { Pages } from '../url';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

describe('timeline actions', () => {
  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange("log_id", 10000, 20000);

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id/10/20');
  });

  it('keeps a zoom starting at the very beginning out of the URL', () => {
    const getState = () => ({ dongleId: 'statedongle', loop: {}, zoom: {} });
    pushTimelineRange('log_id', 0, 20000)(vi.fn(), getState);
    expect(push).toHaveBeenLastCalledWith('/statedongle/log_id');
  });

  it.each([
    ['Prime', Pages.PRIME, '/statedongle/prime'],
    ['stream', Pages.STREAM, '/statedongle/stream'],
    ['settings', Pages.SETTINGS, '/statedongle/settings'],
    ['device', Pages.DEVICE, '/statedongle'],
  ])('generates the %s URL when showing the page', (_name, page, expected) => {
    const dispatch = vi.fn();
    showPage(page)(dispatch, () => ({ dongleId: 'statedongle', page: 'other' }));
    expect(push).toHaveBeenCalledWith(expected);
    expect(dispatch).toHaveBeenCalledWith({ type: 'ACTION_SET_PAGE', page });
  });

  it('opens settings for the selected device in place', () => {
    push.mockClear();
    const dispatch = vi.fn();
    openDeviceSettings('statedongle')(dispatch, () => ({ dongleId: 'statedongle', page: Pages.DEVICE, selectedRouteId: null }));
    expect(dispatch).toHaveBeenCalledOnce();
    expect(typeof dispatch.mock.calls[0][0]).toBe('function'); // showPage
  });

  it('selects another device before opening its settings', () => {
    const dispatch = vi.fn();
    openDeviceSettings('otherdongle')(dispatch, () => ({ dongleId: 'statedongle', page: Pages.DEVICE }));
    expect(dispatch).toHaveBeenCalledTimes(2); // selectDevice, then showPage
  });

  it('shows a page without changing the URL when asked not to', () => {
    push.mockClear();
    const dispatch = vi.fn();
    showPage(Pages.STREAM, false)(dispatch, () => ({ dongleId: 'statedongle', page: Pages.DEVICE }));
    expect(push).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
