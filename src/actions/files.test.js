import { athena } from '../api';
import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import reducer from '../reducers/globalState';
import { cancelFetchUploadQueue, fetchFiles, fetchUploadQueue } from './files';
import * as Types from './types';

vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('../api/backend', () => ({ api: { routes: { getRouteFiles: vi.fn() } } }));
vi.mock('../timeline', () => ({ currentOffset: vi.fn() }));
vi.mock('./index', () => ({
  fetchDeviceNetworkStatus: () => ({ type: 'NETWORK' }),
  updateDeviceOnline: () => ({ type: 'ONLINE' }),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-06--13-00-00';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function create() {
  let state = {
    ...createInitialState('/' + DONGLE + '/' + LOG),
    devices: [], device: { dongle_id: DONGLE },
    currentRoute: { fullname: DONGLE + '|' + LOG, log_id: LOG },
  };
  const actions = [];
  const dispatch = (action) => {
    if (typeof action === 'function') return action(dispatch, () => state);
    actions.push(action);
    state = reducer(state, action);
  };
  return { dispatch, actions, getState: () => state, setState: (next) => { state = next; } };
}

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { cancelFetchUploadQueue(); vi.useRealTimers(); });

it('does not commit or restart an upload queue after its dialog closes', async () => {
  const response = deferred();
  athena.postJsonRpcPayload.mockReturnValue(response.promise);
  const store = create();
  const loading = store.dispatch(fetchUploadQueue(DONGLE));
  cancelFetchUploadQueue();
  response.resolve({ result: [{
    id: 'old', url: 'https://example.com/' + DONGLE + '/' + LOG + '/0/fcamera.hevc', progress: 0.5,
  }] });
  await loading;
  expect(store.actions.some((action) => action.type === Types.ACTION_FILES_UPLOADING)).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the new device queue when a canceled old-device request finishes later', async () => {
  const oldResponse = deferred();
  const newResponse = deferred();
  athena.postJsonRpcPayload.mockImplementation((dongleId) => dongleId === DONGLE ? oldResponse.promise : newResponse.promise);
  const store = create();
  const oldLoading = store.dispatch(fetchUploadQueue(DONGLE));
  cancelFetchUploadQueue();
  store.setState({ ...store.getState(), dongleId: OTHER, device: { dongle_id: OTHER } });
  const newLoading = store.dispatch(fetchUploadQueue(OTHER));
  newResponse.resolve({ result: [] });
  await newLoading;
  oldResponse.resolve({ result: [] });
  await oldLoading;
  expect(store.getState().filesUploadingMeta.dongleId).toBe(OTHER);
  expect(store.actions.filter((action) => action.type === Types.ACTION_FILES_UPLOADING)).toHaveLength(1);
});

it('rejects file URLs that finish after navigating to another drive on the same device', async () => {
  const response = deferred();
  api.routes.getRouteFiles.mockReturnValue(response.promise);
  const store = create();
  const loading = store.dispatch(fetchFiles(DONGLE + '|' + LOG));
  const files = { current: { url: 'cached' } };
  store.setState({
    ...store.getState(), files,
    currentRoute: { fullname: DONGLE + '|' + OTHER_LOG, log_id: OTHER_LOG },
  });
  response.resolve({ cameras: ['https://example.com/' + DONGLE + '/' + LOG + '/0/fcamera.hevc'] });
  await loading;
  expect(store.getState().files).toBe(files);
});
