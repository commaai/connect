import { fetchUploadQueue } from './files';
import { athena } from '../api';
import { ACTION_FILES_UPLOADING } from './types';

vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('.', () => ({ fetchDeviceNetworkStatus: () => ({ type: 'NETWORK' }), updateDeviceOnline: () => ({ type: 'ONLINE' }) }));

it('polls the device asked for, and ignores an older answer', async () => {
  let answerFirst;
  athena.postJsonRpcPayload
    .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve; }))
    .mockResolvedValue({ result: [] });
  const dispatch = vi.fn();
  const getState = () => ({ filesUploading: {}, devices: [], dongleId: null });
  const first = fetchUploadQueue('aaaaaaaaaaaaaaaa')(dispatch, getState);
  await fetchUploadQueue('bbbbbbbbbbbbbbbb')(dispatch, getState);
  await fetchUploadQueue('aaaaaaaaaaaaaaaa')(dispatch, getState);
  answerFirst({ result: [] });
  await first;
  const uploading = dispatch.mock.calls.filter(([action]) => action.type === ACTION_FILES_UPLOADING);
  expect(uploading.map(([action]) => action.dongleId)).toEqual(['bbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaa']);
});
