import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import '../store';
import reducer from '../reducers';
import { createInitialState } from '../initialState';
import { fetchEvents, fetchDriveCoords, fetchCoord } from './cached';
import { reverseLookup } from '../utils/geocode';

vi.mock('../utils/geocode', () => ({ reverseLookup: vi.fn() }));

function create() {
  const route = {
    fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00', log_id: '2026-08-06--12-00-00',
    url: 'https://routes.example.com', maxqlog: 0, duration: 60000,
  };
  const store = createStore(reducer, {
    ...createInitialState('/aaaaaaaaaaaaaaaa'), currentRoute: route,
    routeCache: { [route.log_id]: route },
  }, applyMiddleware(thunk));
  return { store, route };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('route enrichment recovery', () => {
  test('reads from the network when browser storage fails', async () => {
    const { store, route } = create();
    vi.stubGlobal('indexedDB', { open: () => {
      const request = {};
      queueMicrotask(() => request.onsuccess({ target: { result: {
        objectStoreNames: { contains: () => true },
        transaction: () => { throw new Error('storage unavailable'); },
      } } }));
      return request;
    } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    await store.dispatch(fetchEvents(route));
    expect(store.getState().currentRoute.events).toEqual([]);
  });

  test.each([
    [fetchEvents, 'events', [{ type: 'user_bookmark', route_offset_millis: 1250, data: {} }],
      [{ type: 'bookmark', route_offset_millis: 1250, data: { end_route_offset_millis: 2250 } }]],
    [fetchDriveCoords, 'driveCoords', [{ t: 123, lng: -85, lat: 41 }], { 123: [-85, 41] }],
  ])('concurrent failed %s loads settle and a later visit retries', async (load, key, response, expected) => {
    const { store, route } = create();
    let reject;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }))
      .mockResolvedValue({ ok: true, json: async () => response });
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = store.dispatch(load(route));
    const second = store.dispatch(load(route));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    reject(new Error('offline'));
    await Promise.all([first, second]);
    expect(store.getState().currentRoute[key]).toBeUndefined();
    await store.dispatch(load(route));
    expect(store.getState().currentRoute[key]).toEqual(expected);
  });

  test.each([fetchEvents, fetchDriveCoords])('retries a server error but reuses a missing segment for %s', async (load) => {
    const { store, route } = create();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await store.dispatch(load(route));
    expect(store.getState().currentRoute).not.toHaveProperty(load === fetchEvents ? 'events' : 'driveCoords');
    await store.dispatch(load(route));
    expect(store.getState().currentRoute[load === fetchEvents ? 'events' : 'driveCoords']).toEqual(load === fetchEvents ? [] : {});
    await store.dispatch(load(route));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test.each([null, new Error('offline')])('settles failed geocoding for both endpoints and retries (%s)', async (failure) => {
    const { store, route } = create();
    reverseLookup.mockImplementationOnce(async () => {
      if (failure) throw failure;
      return null;
    }).mockResolvedValue({ place: 'Fort Wayne', details: 'Indiana' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await Promise.all(['startLocation', 'endLocation'].map(key => store.dispatch(fetchCoord(route, [-85.1234, 41.2345], key))));
    expect(store.getState().currentRoute.startLocation).toBeUndefined();
    await store.dispatch(fetchCoord(route, [-85.1234, 41.2345], 'startLocation'));
    expect(store.getState().currentRoute.startLocation).toEqual({ place: 'Fort Wayne', details: 'Indiana' });
  });
});
