import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { replace } from 'connected-react-router';

import { Media } from './Media';
import { api } from '../../api/backend';
import { deviceSupportsClips } from '../../api/clips';

vi.mock('../../api', () => ({ USERADMIN_URL_ROOT: 'https://useradmin.example.com/' }));
vi.mock('../../api/backend', () => ({ api: { routes: {
  getPreservedRoutes: vi.fn(),
  setRoutePreserved: vi.fn(),
  setRoutePublic: vi.fn(),
} } }));
vi.mock('../../api/clips', () => ({ deviceSupportsClips: vi.fn() }));
vi.mock('../../hooks/window', () => ({ subscribeWindowSize: () => () => {} }));
vi.mock('../DriveMap', () => ({ default: () => null }));
vi.mock('../DriveVideo', () => ({ default: () => null }));
vi.mock('../TimeDisplay', () => ({ default: () => null }));
vi.mock('./ClipMenu', () => ({ default: () => null }));
vi.mock('../../timeline/playback', () => ({ bufferVideo: () => ({ type: 'test/buffer' }) }));
vi.mock('../../utils', () => ({
  deviceIsOnline: () => false,
  deviceOnCellular: () => false,
  getSegmentNumber: () => 0,
}));
vi.mock('../../actions', () => ({
  analyticsEvent: () => ({ type: 'test/analytics' }),
  updateRoute: () => ({ type: 'test/update-route' }),
}));
vi.mock('../../actions/cached', () => ({ fetchEvents: () => ({ type: 'test/events' }) }));
vi.mock('../../analytics', () => ({ attachRelTime: vi.fn() }));
vi.mock('../../actions/files', () => ({
  setRouteViewed: () => ({ type: 'test/viewed' }),
  fetchFiles: () => ({ type: 'test/files' }),
  doUpload: () => ({ type: 'test/upload' }),
  fetchUploadUrls: vi.fn(),
  fetchAthenaQueue: () => ({ type: 'test/queue' }),
  updateFiles: () => ({ type: 'test/update-files' }),
  FILE_NAMES: {},
}));
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const ROUTE_A = { fullname: `${FIRST}|2026-08-06--12-00-00`, is_public: false };
const ROUTE_B = { fullname: `${FIRST}|2026-08-06--13-00-00`, is_public: false };
const OTHER_DEVICE_ROUTE = { fullname: `${SECOND}|2026-08-06--12-00-00`, is_public: false };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function routeLocation(route) {
  return {
    pathname: `/${route.fullname.replace('|', '/')}`,
    search: '?campaign=summer&dialog=route-info',
    hash: '#route',
    key: route.fullname,
  };
}

async function mountMedia() {
  const ref = React.createRef();
  let props = {
    classes: {},
    dispatch: vi.fn(),
    dongleId: FIRST,
    device: { dongle_id: FIRST, is_owner: true, shared: false },
    currentRoute: ROUTE_A,
    routes: [ROUTE_A, ROUTE_B],
    location: routeLocation(ROUTE_A),
    dialog: 'route-info',
    profile: { superuser: false },
    files: null,
    isBufferingVideo: false,
  };
  const view = render(<Media ref={ref} {...props} />);
  // Settle the independent clips-support check and any already-resolved read.
  await act(async () => {});
  return {
    ref,
    dispatch: props.dispatch,
    initialLocation: props.location,
    unmount: view.unmount,
    update(next) {
      props = { ...props, ...next };
      view.rerender(<Media ref={ref} {...props} />);
    },
    changeRoute(route) {
      const dongleId = route.fullname.split('|')[0];
      props = {
        ...props,
        currentRoute: route,
        dongleId,
        device: { ...props.device, dongle_id: dongleId },
        location: routeLocation(route),
      };
      view.rerender(<Media ref={ref} {...props} />);
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.routes.getPreservedRoutes.mockResolvedValue([]);
  api.routes.setRoutePreserved.mockResolvedValue({ success: true });
  deviceSupportsClips.mockResolvedValue(false);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('Media route preservation lifecycle', () => {
  test.each([ROUTE_B, OTHER_DEVICE_ROUTE])('an earlier preserved-list response cannot change %j', async (nextRoute) => {
    const oldRead = deferred();
    const newRead = deferred();
    api.routes.getPreservedRoutes.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    const media = await mountMedia();
    media.changeRoute(nextRoute);
    await act(async () => newRead.resolve([nextRoute]));
    expect(screen.getByLabelText('Preserved')).toBeChecked();
    await act(async () => oldRead.resolve([]));
    expect(screen.getByLabelText('Preserved')).toBeChecked();
    expect(api.routes.getPreservedRoutes.mock.calls.map(([dongleId]) => dongleId))
      .toEqual([FIRST, nextRoute.fullname.split('|')[0]]);
  });

  test('changing routes clears the previous preserved value while the next read is pending', async () => {
    const newRead = deferred();
    api.routes.getPreservedRoutes.mockResolvedValueOnce([ROUTE_A]).mockReturnValueOnce(newRead.promise);
    const media = await mountMedia();
    expect(screen.getByLabelText('Preserved')).toBeChecked();
    media.changeRoute(ROUTE_B);
    expect(media.ref.current.state.routePreserved).toBeNull();
    expect(screen.getByLabelText('Preserved')).toBeDisabled();
    await act(async () => newRead.resolve([]));
    expect(screen.getByLabelText('Preserved')).not.toBeChecked();
    expect(screen.getByLabelText('Preserved')).toBeEnabled();
  });

  test('a preserve toggle invalidates a read that started before the user action', async () => {
    const oldRead = deferred();
    const toggle = deferred();
    const media = await mountMedia();
    api.routes.getPreservedRoutes.mockReturnValueOnce(oldRead.promise);
    api.routes.setRoutePreserved.mockReturnValueOnce(toggle.promise);
    let readPromise;
    let togglePromise;
    act(() => { readPromise = media.ref.current.fetchRoutePreserved(); });
    act(() => { togglePromise = media.ref.current.onPreserveToggle({ target: { checked: true } }); });
    expect(api.routes.setRoutePreserved).toHaveBeenCalledWith(ROUTE_A.fullname, true);
    await act(async () => {
      toggle.resolve({ success: true });
      await togglePromise;
    });
    expect(screen.getByLabelText('Preserved')).toBeChecked();
    await act(async () => {
      oldRead.resolve([]);
      await readPromise;
    });
    expect(screen.getByLabelText('Preserved')).toBeChecked();
  });

  test('a pending switch does not carry its optimistic value into the next route', async () => {
    const toggle = deferred();
    api.routes.getPreservedRoutes.mockResolvedValueOnce([ROUTE_A]).mockResolvedValueOnce([ROUTE_B]);
    api.routes.setRoutePreserved.mockReturnValueOnce(toggle.promise);
    const media = await mountMedia();
    fireEvent.click(screen.getByLabelText('Preserved'));
    expect(api.routes.setRoutePreserved).toHaveBeenCalledWith(ROUTE_A.fullname, false);
    expect(screen.getByLabelText('Preserved')).not.toBeChecked();
    media.changeRoute(ROUTE_B);
    await act(async () => {});
    expect(screen.getByLabelText('Preserved')).toBeChecked();
    await act(async () => toggle.resolve({ success: true }));
    expect(screen.getByLabelText('Preserved')).toBeChecked();
  });

  test.each([
    ['another route', false],
    ['the original route after leaving and returning', true],
  ])('a rejected old toggle cannot change or refetch %s', async (_name, returnToOriginal) => {
    const toggle = deferred();
    api.routes.setRoutePreserved.mockReturnValueOnce(toggle.promise);
    const media = await mountMedia();
    let togglePromise;
    act(() => { togglePromise = media.ref.current.onPreserveToggle({ target: { checked: false } }); });
    api.routes.getPreservedRoutes.mockResolvedValueOnce([ROUTE_B]);
    media.changeRoute(ROUTE_B);
    await act(async () => {});
    if (returnToOriginal) {
      api.routes.getPreservedRoutes.mockResolvedValueOnce([ROUTE_A]);
      media.changeRoute(ROUTE_A);
      await act(async () => {});
    }
    expect(screen.getByLabelText('Preserved')).toBeChecked();
    const readCount = api.routes.getPreservedRoutes.mock.calls.length;
    let result;
    await act(async () => {
      toggle.reject(new Error('Previous route request failed'));
      result = await togglePromise;
    });
    expect(result).toBeNull();
    expect(screen.getByLabelText('Preserved')).toBeChecked();
    expect(api.routes.getPreservedRoutes).toHaveBeenCalledTimes(readCount);
  });

  test('an unmounted Media ignores a pending preserved-list response', async () => {
    const read = deferred();
    api.routes.getPreservedRoutes.mockReturnValueOnce(read.promise);
    const media = await mountMedia();
    const setState = vi.spyOn(media.ref.current, 'setState');
    media.unmount();
    await act(async () => read.resolve([ROUTE_A]));
    expect(setState).not.toHaveBeenCalled();
  });
});

describe('Media clipboard navigation', () => {
  test('copying the segment name closes its original dialog after success', async () => {
    const clipboard = deferred();
    navigator.clipboard.writeText.mockReturnValueOnce(clipboard.promise);
    const media = await mountMedia();
    media.dispatch.mockClear();
    const copyPromise = media.ref.current.copySegmentName();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${ROUTE_A.fullname.replace('|', '/')}/0`);
    expect(media.dispatch).not.toHaveBeenCalled();
    await act(async () => {
      clipboard.resolve();
      await copyPromise;
    });
    expect(media.dispatch).toHaveBeenCalledTimes(1);
    expect(media.dispatch).toHaveBeenCalledWith(replace({
      ...media.initialLocation,
      search: '?campaign=summer',
    }));
  });

  test.each([false, true])('clipboard completion cannot close a newer visit (return to original: %s)', async (returnToOriginal) => {
    const clipboard = deferred();
    navigator.clipboard.writeText.mockReturnValueOnce(clipboard.promise);
    const media = await mountMedia();
    const copyPromise = media.ref.current.copySegmentName();
    media.update({
      location: { ...media.initialLocation, search: '?dialog=files', key: 'new-menu-visit' },
      dialog: 'files',
    });
    if (returnToOriginal) {
      // History may restore the exact object that was captured before copying.
      media.update({ location: media.initialLocation, dialog: 'route-info' });
    }
    media.dispatch.mockClear();
    await act(async () => {
      clipboard.resolve();
      await copyPromise;
    });
    expect(media.dispatch).not.toHaveBeenCalled();
  });
});
