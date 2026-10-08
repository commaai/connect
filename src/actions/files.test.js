import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import reducer from '../reducers/globalState';
import { createInitialState } from '../initialState';
import { athena } from '../api';
import { api } from '../api/backend';
import { fetchUploadQueue, cancelFetchUploadQueue } from './files';

vi.mock('../timeline', () => ({ currentOffset: () => 0 }));

vi.mock('./index', () => ({
  updateDeviceOnline: (dongleId, lastAthenaPing) => ({ type: 'ACTION_UPDATE_DEVICE_ONLINE', dongleId, last_athena_ping: lastAthenaPing }),
  fetchDeviceNetworkStatus: () => ({ type: 'TEST_NETWORK_STATUS' }),
}));

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const LOG = '2026-08-06--12-00-00';
const queued = (dongleId, id = '1') => ({ id, url: `https://files.example/${dongleId}/${LOG}/0/fcamera.hevc`,
  current: false, progress: 0, allow_cellular: false, created_at: 1 });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function makeStore() {
  const devices = [A, B].map(dongleId => ({ dongle_id: dongleId, is_owner: true, openpilot_version: '0.11.2' }));
  return createStore(reducer, { ...createInitialState(`/${A}`), devices, device: devices[0] }, applyMiddleware(thunk));
}

beforeEach(() => {
  cancelFetchUploadQueue();
  vi.useFakeTimers();
});
afterEach(() => {
  cancelFetchUploadQueue();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('a delayed old device response cannot replace the active queue or resume its polling', async () => {
  const old = deferred();
  const rpc = vi.spyOn(athena, 'postJsonRpcPayload').mockImplementation(dongleId => dongleId === A
    ? old.promise : Promise.resolve({ result: [queued(B)] }));
  const store = makeStore();
  const request = store.dispatch(fetchUploadQueue(A));
  store.dispatch({ type: 'ACTION_SELECT_DEVICE', dongleId: B });
  await store.dispatch(fetchUploadQueue(B));
  const current = store.getState().filesUploading;
  old.resolve({ result: [queued(A)] });
  await request;
  expect(store.getState().filesUploadingMeta.dongleId).toBe(B);
  expect(store.getState().filesUploading).toBe(current);
  await vi.advanceTimersByTimeAsync(2000);
  expect(rpc.mock.calls.map(([dongleId]) => dongleId)).toEqual([A, B, B]);
});

it('closing and reopening the same queue invalidates its earlier in-flight response', async () => {
  const old = deferred();
  vi.spyOn(athena, 'postJsonRpcPayload').mockReturnValueOnce(old.promise)
    .mockResolvedValue({ result: [queued(A, 'new')] });
  const store = makeStore();
  const request = store.dispatch(fetchUploadQueue(A));
  cancelFetchUploadQueue();
  await store.dispatch(fetchUploadQueue(A));
  old.resolve({ result: [queued(A, 'old')] });
  await request;
  expect(Object.keys(store.getState().filesUploading)).toEqual(['new']);
});

it('cancellation discards a late response without scheduling another poll', async () => {
  const old = deferred();
  const rpc = vi.spyOn(athena, 'postJsonRpcPayload').mockReturnValue(old.promise);
  const store = makeStore();
  const before = store.getState().filesUploadingMeta;
  const request = store.dispatch(fetchUploadQueue(A));
  cancelFetchUploadQueue();
  old.resolve({ result: [queued(A)] });
  await request;
  expect(store.getState().filesUploadingMeta).toBe(before);
  await vi.advanceTimersByTimeAsync(10000);
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('deduplicates the active request and never mutates its previous queue snapshot', async () => {
  const old = deferred();
  const rpc = vi.spyOn(athena, 'postJsonRpcPayload').mockReturnValue(old.promise);
  const store = makeStore();
  const before = Object.freeze({ retained: Object.freeze({ fileName: `${A}|${LOG}--0/cameras` }) });
  store.dispatch({ type: 'ACTION_FILES_UPLOADING', dongleId: A, uploading: before, files: {} });
  const request = store.dispatch(fetchUploadQueue(A));
  await store.dispatch(fetchUploadQueue(A));
  old.resolve({ result: [queued(A, 'retained')] });
  await request;
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(Object.keys(before)).toEqual(['retained']);
});

it('allows another owned device queue above the selected background device', async () => {
  vi.spyOn(athena, 'postJsonRpcPayload').mockResolvedValue({ result: [queued(B)] });
  const store = makeStore();
  await store.dispatch(fetchUploadQueue(B));
  expect(store.getState().dongleId).toBe(A);
  expect(store.getState().filesUploadingMeta.dongleId).toBe(B);
});

it('does not treat the previous device queue as completed uploads on the new device', async () => {
  vi.spyOn(athena, 'postJsonRpcPayload').mockResolvedValue({ result: [queued(B)] });
  const files = vi.spyOn(api.routes, 'getRouteFiles').mockResolvedValue({});
  const store = makeStore();
  store.dispatch({ type: 'ACTION_FILES_UPLOADING', dongleId: A,
    uploading: { old: { fileName: `${A}|${LOG}--0/cameras` } }, files: {} });
  store.dispatch({ type: 'ACTION_SELECT_DEVICE', dongleId: B });
  await store.dispatch(fetchUploadQueue(B));
  expect(files).not.toHaveBeenCalled();
  expect(store.getState().filesUploadingMeta.dongleId).toBe(B);
});

it('an offline result cannot cancel a queue opened by an online-status subscriber', async () => {
  const newer = deferred();
  const rpc = vi.spyOn(athena, 'postJsonRpcPayload').mockImplementation(dongleId => dongleId === A
    ? Promise.resolve({ offline: true }) : newer.promise);
  const store = makeStore();
  let started = false;
  let next;
  const unsubscribe = store.subscribe(() => {
    if (!started && store.getState().devices[0].last_athena_ping === 0) {
      started = true;
      next = store.dispatch(fetchUploadQueue(B));
    }
  });
  await store.dispatch(fetchUploadQueue(A));
  newer.resolve({ result: [queued(B)] });
  await next;
  unsubscribe();
  expect(rpc.mock.calls.map(([dongleId]) => dongleId)).toEqual([A, B]);
  expect(store.getState().filesUploadingMeta.dongleId).toBe(B);
});
