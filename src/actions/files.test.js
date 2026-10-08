import { createAppStore } from '../store';
import { createMemoryHistory } from 'history';
import { createInitialState } from '../initialState';
import { athena as Athena } from '../api';
import { cancelFetchUploadQueue, fetchUploadQueue } from './files';

vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('./index', () => ({
  updateDeviceOnline: () => ({ type: 'test/online' }),
  fetchDeviceNetworkStatus: () => ({ type: 'test/network' }),
}));
vi.mock('../analytics', () => ({ analyticsMiddleware: () => (next) => (action) => next(action) }));

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const upload = (dongleId) => ({
  id: dongleId, current: false, progress: 0,
  url: `https://uploads.example.com/${dongleId}/2026-08-06--12-00-00/0/qlog.bz2`,
});

function create() {
  const history = createMemoryHistory({ initialEntries: [`/${FIRST}`] });
  return createAppStore(history, {
    ...createInitialState(history.location.pathname),
    devices: [{ dongle_id: FIRST }, { dongle_id: SECOND }],
    device: { dongle_id: FIRST },
  });
}

afterEach(() => {
  cancelFetchUploadQueue();
  vi.clearAllMocks();
});

test('a cancelled response cannot replace a newer device queue', async () => {
  let resolveFirst;
  Athena.postJsonRpcPayload.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
    .mockResolvedValueOnce({ result: [upload(SECOND)] });
  const store = create();
  const first = store.dispatch(fetchUploadQueue(FIRST));
  cancelFetchUploadQueue();
  await store.dispatch(fetchUploadQueue(SECOND));
  const current = store.getState().filesUploading;
  resolveFirst({ result: [upload(FIRST)] });
  await first;
  expect(store.getState().filesUploading).toBe(current);
  expect(store.getState().filesUploadingMeta.dongleId).toBe(SECOND);
  expect(store.getState().files).toBeNull();
});

test('polling keeps the previous Redux state immutable', async () => {
  Athena.postJsonRpcPayload.mockResolvedValue({ result: [upload(FIRST)] });
  const store = create();
  await store.dispatch(fetchUploadQueue(FIRST));
  const previous = store.getState().filesUploading;
  cancelFetchUploadQueue();
  await store.dispatch(fetchUploadQueue(FIRST));
  expect(Object.keys(previous)).toEqual([FIRST]);
  expect(store.getState().filesUploading).not.toBe(previous);
});
