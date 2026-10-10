import { fetchUploadQueue, cancelFetchUploadQueue, fetchFiles } from './files';
import { api } from '../api/backend';
import { athena } from '../api';
import { createInitialState } from '../initialState';

vi.mock('../store', () => ({ default: { getState: vi.fn() } }));
vi.mock('../api/backend', () => ({ api: { routes: { getRouteFiles: vi.fn() } } }));
vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('./index', () => ({ updateDeviceOnline: vi.fn(() => ({ type: 'ONLINE' })), fetchDeviceNetworkStatus: vi.fn(() => ({ type: 'NETWORK' })) }));

it('loads another device queue while the background queue is pending', async () => {
  let resolve;
  athena.postJsonRpcPayload.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce({ result: [] });
  const state = { ...createInitialState(), device: { dongle_id: 'aaaaaaaaaaaaaaaa' }, devices: [] };
  const dispatch = vi.fn();
  const first = fetchUploadQueue('aaaaaaaaaaaaaaaa')(dispatch, () => state);
  await fetchUploadQueue('bbbbbbbbbbbbbbbb')(dispatch, () => state);
  expect(athena.postJsonRpcPayload).toHaveBeenCalledTimes(2);
  resolve({ result: [] });
  await first;
  cancelFetchUploadQueue('aaaaaaaaaaaaaaaa');
  cancelFetchUploadQueue('bbbbbbbbbbbbbbbb');
});


it('uses the requested route identity for shared demo file URLs', async () => {
  const routeName = 'deadbeefdeadbeef|00000000--0000000002';
  const file = 'https://routes.example.com/5beb9b58bd12b691/0000010a--a51155e496/1/fcamera.hevc?signature=test';
  api.routes.getRouteFiles.mockResolvedValueOnce({ cameras: [file] });
  const dispatch = vi.fn();
  await fetchFiles(routeName)(dispatch);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ routeName, urls: { [`${routeName}--1/cameras`]: { url: file } } }));
});
