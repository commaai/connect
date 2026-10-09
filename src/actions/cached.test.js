import { fetchDriveCoords, fetchEvents } from './cached';
import { ACTION_UPDATE_ROUTE, ACTION_UPDATE_ROUTE_EVENTS } from './types';

const drive = { fullname: '0000aaaa0000aaaa|2026-08-06--12-00-00', url: 'https://routes.example.com', maxqlog: 0 };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
});

it.each([
  ['events', fetchEvents, 'events.json', ACTION_UPDATE_ROUTE_EVENTS],
  ['coordinates', fetchDriveCoords, 'coords.json', ACTION_UPDATE_ROUTE],
])("loads a drive's %s when it isn't in the drive list", async (_name, load, file, type) => {
  const dispatch = vi.fn();
  await load(drive)(dispatch, () => ({ routes: null }));
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith(file))).toBe(true);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type, fullname: drive.fullname }));
});

it('does not load events a drive already has', async () => {
  const dispatch = vi.fn();
  await fetchEvents({ ...drive, events: [] })(dispatch, () => ({ routes: null }));
  expect(fetch).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});
