import { vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';

const mocks = vi.hoisted(() => ({ authenticated: true }));

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => mocks.authenticated },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function open(url) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const store = createAppStore(history, createInitialState());
  const announce = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(announce);
  announce(history.location, history.action);
  return { history, store };
}

beforeEach(() => {
  mocks.authenticated = true;
  api.routes.getRoutesSegments.mockReset();
  api.routes.getRoutesSegments.mockResolvedValue([]);
});

describe('history middleware', () => {
  it.each([
    ['opened directly', (url) => open(url)],
    ['pushed', (url) => {
      const app = open('/');
      app.history.push(url);
      return app;
    }],
    ['replaced', (url) => {
      const app = open('/');
      app.history.replace(url);
      return app;
    }],
    ['reached with back', (url) => {
      const app = open(url);
      app.history.push(`/${OTHER}`);
      app.history.goBack();
      return app;
    }],
  ])('reaches the same drive when the URL is %s', (_name, reach) => {
    const { store } = reach(`/${DONGLE}/${LOG}/10/20`);
    expect(store.getState()).toMatchObject({
      dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 },
    });
  });

  it('does nothing when only the dialog changes', () => {
    const { history, store } = open(`/${DONGLE}`);
    const before = store.getState();
    history.push(`/${DONGLE}?dialog=settings`);
    expect(store.getState().place.dialog).toBe('settings');
    expect(store.getState().filter).toBe(before.filter);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
  });

  it('leaves a drive for the dashboard', () => {
    const { history, store } = open(`/${DONGLE}/${LOG}/10/20`);
    history.push(`/${DONGLE}`);
    expect(store.getState()).toMatchObject({ selectedRouteId: null, zoom: null });
  });

  it('loads routes once per device', () => {
    const { history } = open(`/${DONGLE}`);
    history.push(`/${DONGLE}/prime`);
    history.push(`/${DONGLE}`);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
    history.push(`/${OTHER}`);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('loads only public drives for signed-out visitors', () => {
    mocks.authenticated = false;
    expect(open(`/${DONGLE}`).store.getState().dongleId).toBeNull();
    expect(open(`/${DONGLE}/${LOG}`).store.getState().dongleId).toBe(DONGLE);
  });

  it('ignores a legacy lookup that answers after the user left', async () => {
    let answer;
    api.routes.getRoutesSegments.mockImplementation((_dongleId, start) => (start === 1000
      ? new Promise((resolve) => { answer = resolve; })
      : Promise.resolve([])));
    const { history } = open(`/${DONGLE}/1000/2000`);
    history.push(`/${OTHER}`);
    answer([{ fullname: `${DONGLE}|${LOG}` }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(history.location.pathname).toBe(`/${OTHER}`);
  });

  it('sends a page view for a new page but not for a dialog', () => {
    const gtag = vi.fn();
    vi.stubGlobal('gtag', gtag);
    const { history } = open(`/${DONGLE}`);
    history.push(`/${DONGLE}?dialog=settings`);
    history.push(`/${DONGLE}/prime`);
    expect(gtag.mock.calls.filter(([, name]) => name === 'page_view')).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it('clears the drive when a signed-out visitor leaves it', () => {
    mocks.authenticated = false;
    const { history, store } = open(`/${DONGLE}/${LOG}`);
    history.push(`/${DONGLE}`);
    expect(store.getState().selectedRouteId).toBeNull();
  });
});
