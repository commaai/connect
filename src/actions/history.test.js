import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { onHistoryMiddleware } from './history';
import * as actions from './index';
import { api } from '../api/backend';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('./index', () => ({
  selectDevice: vi.fn(), pushTimelineRange: vi.fn(), checkRoutesData: vi.fn(),
  checkLastRoutesData: vi.fn(), primeNav: vi.fn(), streamNav: vi.fn(),
}));

const DEVICE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const ROUTE = '2026-08-06--12-00-00';

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

function create(state = {}) {
  let path = '';
  const current = {
    dongleId: DEVICE, selectedRouteId: null, zoom: null, currentRoute: null,
    primeNav: false, streamNav: false, ...state,
  };
  const store = { getState: () => ({ ...current, router: { location: { pathname: path } } }), dispatch: vi.fn() };
  const next = vi.fn((action) => { if (action.type === LOCATION_CHANGE) path = action.payload.location.pathname; });
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  const setPath = (pathname) => { path = pathname; };
  return { store, next, invoke, setPath };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of Object.keys(actions)) {
    if (typeof actions[name]?.mockImplementation === 'function') {
      actions[name].mockImplementation((...args) => ({ name, args }));
    }
  }
});

describe('history reconciliation', () => {
  it('passes through non-location actions and malformed URLs', () => {
    const { store, next, invoke } = create();
    invoke({ type: 'OTHER' });
    invoke(location(`/${DEVICE}/prime/extra`));
    expect(next).toHaveBeenCalledTimes(2);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('uses the same state transition for %s', (historyAction) => {
    const { store, next, invoke } = create();
    invoke(location(`/${OTHER}/${ROUTE}/0/20`, historyAction));
    expect(next).toHaveBeenCalledOnce();
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(ROUTE, 0, 20000, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledTimes(3);
  });

  it('keeps the device and route data when opening settings', () => {
    const { store, invoke } = create();
    invoke(location(`/${DEVICE}/settings`, 'PUSH'));
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('resolves root navigation to the current device URL', () => {
    const { store, invoke } = create();
    invoke(location('/', 'POP'));
    expect(store.dispatch.mock.calls[0][0].payload).toMatchObject({
      method: 'replace', args: [`/${DEVICE}`],
    });
  });

  it('closes a drive and restores the device list', () => {
    const { invoke } = create({ selectedRouteId: ROUTE, zoom: { start: 0, end: 20000 }, limit: 5 });
    invoke(location(`/${DEVICE}`, 'POP'));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it('refreshes the device list with a nonzero limit on device change', () => {
    const { invoke } = create();
    invoke(location(`/${OTHER}`, 'PUSH'));
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('resolves old absolute-time links only while they are still current', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((done) => { resolve = done; }));
    const first = create();
    first.invoke(location(`/${DEVICE}/1000/2000`));
    first.setPath(`/${DEVICE}`);
    resolve([{ fullname: `${DEVICE}|${ROUTE}` }]);
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DEVICE, 1000, 2000));
    expect(first.store.dispatch).not.toHaveBeenCalled();

    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DEVICE}|${ROUTE}` }]);
    const second = create();
    second.invoke(location(`/${DEVICE}/1000/2000`));
    await vi.waitFor(() => expect(second.store.dispatch).toHaveBeenCalled());
    expect(second.store.dispatch.mock.calls[0][0].payload).toMatchObject({ method: 'replace', args: [`/${DEVICE}/${ROUTE}`] });
  });
});
