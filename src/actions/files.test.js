import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { athena as Athena } from '../api';
import { createInitialState } from '../initialState';
import rootReducer from '../reducers';
import { cancelFetchUploadQueue, fetchUploadQueue } from './files';

vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('./index', () => ({ updateDeviceOnline: () => ({ type: 'ONLINE' }), fetchDeviceNetworkStatus: () => ({ type: 'NETWORK' }) }));
vi.mock('../store', () => ({ default: {} }));
const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';

function setup(target = DONGLE) {
  return createStore(rootReducer, {
    ...createInitialState({ pathname: `/${DONGLE}`, search: `?modal=uploads&device=${target}` }),
    device: { dongle_id: DONGLE },
    devices: [{ dongle_id: DONGLE }, { dongle_id: OTHER }],
  }, applyMiddleware(thunk));
}

afterEach(() => { cancelFetchUploadQueue(); vi.clearAllMocks(); });

test('an upload modal can load an unselected device without changing the selected device', async () => {
  Athena.postJsonRpcPayload.mockResolvedValue({ result: [] });
  const store = setup(OTHER);
  await store.dispatch(fetchUploadQueue(OTHER));
  expect(store.getState().dongleId).toBe(DONGLE);
  expect(store.getState().filesUploadingMeta.dongleId).toBe(OTHER);
});

test('cancelling a pending upload poll prevents its result from replacing a later one', async () => {
  let resolve;
  Athena.postJsonRpcPayload.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ result: [] });
  const store = setup(OTHER);
  const pending = store.dispatch(fetchUploadQueue(DONGLE));
  cancelFetchUploadQueue();
  await store.dispatch(fetchUploadQueue(OTHER));
  const after = store.getState().filesUploadingMeta;
  resolve({ result: [] });
  await pending;
  expect(store.getState().filesUploadingMeta).toBe(after);
  expect(after.dongleId).toBe(OTHER);
});
