import { Navigation } from '.';
import { reverseLookup } from '../../utils/geocode';

vi.mock('../../utils/geocode', () => ({ reverseLookup: vi.fn(), DEFAULT_LOCATION: {} }));
vi.mock('../../actions', () => ({ analyticsEvent: vi.fn() }));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function navigation() {
  const nav = new Navigation({ dongleId: 'first', dispatch: vi.fn() });
  nav.mounted = true;
  nav.setState = vi.fn(update => {
    const next = typeof update === 'function' ? update(nav.state) : update;
    if (next) nav.state = { ...nav.state, ...next };
  });
  return nav;
}

beforeEach(() => vi.clearAllMocks());

test('a completed lookup enriches the selected car without changing its position', async () => {
  const lookup = deferred();
  reverseLookup.mockReturnValue(lookup.promise);
  const nav = navigation();
  nav.onCarSelect({ location: [1, 2] });
  lookup.resolve({ place: 'Car park', details: 'Main Street' });
  await lookup.promise;
  expect(nav.state.searchSelect).toMatchObject({ position: { lng: 1, lat: 2 }, title: 'Car park', address: { label: 'Main Street' } });
});

test('a late lookup does not reopen a dismissed popup', async () => {
  const lookup = deferred();
  reverseLookup.mockReturnValue(lookup.promise);
  const nav = navigation();
  nav.onCarSelect({ location: [1, 2] });
  nav.clearSearchSelect();
  lookup.resolve({ place: 'Old place', details: 'Old address' });
  await lookup.promise;
  expect(nav.state.searchSelect).toBeNull();
});

test('an older response cannot overwrite a newer car selection', async () => {
  const old = deferred();
  const current = deferred();
  reverseLookup.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const nav = navigation();
  nav.onCarSelect({ location: [1, 2] });
  nav.onCarSelect({ location: [3, 4] });
  current.resolve({ place: 'New place', details: 'New address' });
  await current.promise;
  old.resolve({ place: 'Old place', details: 'Old address' });
  await old.promise;
  expect(nav.state.searchSelect).toMatchObject({ position: { lng: 3, lat: 4 }, title: 'New place' });
});

test.each(['device change', 'unmount'])('ignore a lookup after %s', async reason => {
  const lookup = deferred();
  reverseLookup.mockReturnValue(lookup.promise);
  const nav = navigation();
  nav.onCarSelect({ location: [1, 2] });
  if (reason === 'device change') nav.props = { ...nav.props, dongleId: 'second' };
  else nav.componentWillUnmount();
  nav.setState.mockClear();
  lookup.resolve({ place: 'Old place', details: 'Old address' });
  await lookup.promise;
  expect(nav.setState).not.toHaveBeenCalled();
});
