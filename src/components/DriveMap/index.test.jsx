import { DriveMap } from './index';

const clock = vi.hoisted(() => ({ offset: 0 }));
vi.mock('../../timeline', () => ({ currentOffset: () => clock.offset }));
vi.mock('../../actions/cached', () => ({ fetchDriveCoords: vi.fn() }));
vi.mock('react-map-gl', () => ({ default: () => null, LinearInterpolator: class {} }));

function setup(coords = { 10: [20, 30], 11: [22, 32] }) {
  const map = new DriveMap({ currentRoute: { driveCoords: coords } });
  map.state.driveCoordsMin = Math.min(...Object.keys(coords));
  map.state.driveCoordsMax = Math.max(...Object.keys(coords));
  const marker = { _data: { coordinates: [] }, setData: vi.fn(data => { marker._data = data; }) };
  map.map = { getMap: () => ({ getSource: () => marker }) };
  map.mounted = true;
  map.moveViewportTo = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  return { map, marker };
}
afterEach(() => vi.unstubAllGlobals());

test('does not report the first GPS fix before its timestamp', () => {
  const { map } = setup();
  expect(map.posAtOffset(0)).toBeNull();
  expect(map.posAtOffset(9999)).toBeNull();
  expect(map.posAtOffset(10000)).toEqual([20, 30]);
  expect(map.posAtOffset(10500)).toEqual([21, 31]);
});

test('seeking before GPS clears the old marker and seeking back restores it', () => {
  const { map, marker } = setup();
  clock.offset = 10000;
  map.updateMarkerPos();
  expect(marker._data.coordinates).toEqual([20, 30]);
  clock.offset = 0;
  map.updateMarkerPos();
  expect(marker._data.coordinates).toEqual([]);
  clock.offset = 10000;
  map.updateMarkerPos();
  expect(marker._data.coordinates).toEqual([20, 30]);
});

test('empty GPS data has no marker and a real zero coordinate is shown', () => {
  expect(setup({}).map.posAtOffset(10000)).toBeNull();
  const { map, marker } = setup({ 0: [0, 0] });
  clock.offset = 0;
  map.updateMarkerPos();
  expect(marker._data.coordinates).toEqual([0, 0]);
});

test('an internal GPS gap has no invented position, and the last fix stays available', () => {
  const { map } = setup({ 10: [20, 30], 20: [22, 32] });
  expect(map.posAtOffset(15000)).toBeNull();
  expect(map.posAtOffset(25000)).toEqual([22, 32]);
});
