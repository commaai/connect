import { createMemoryHistory } from 'history';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { ACTION_APPLY_LOCATION } from './types';
import { doUpload, updateFiles } from './files';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../api', () => ({ athena: { postJsonRpcPayload: rpc } }));
vi.mock('../api/backend', () => ({ api: {} }));
const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const PATH = '2026-08-06--12-00-00--0/rlog.zst';

it('keeps an asynchronous upload owned by A when the user switches to B', async () => {
  vi.stubGlobal('gtag', vi.fn());
  let resolveUrls, resolveUpload;
  const urls = new Promise((resolve) => { resolveUrls = resolve; });
  rpc.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
  const device = { dongle_id: A, openpilot_version: '0.8.13' };
  const store = createAppStore(createMemoryHistory(), { ...createInitialState(), device, dongleId: A,
    devices: [device, { dongle_id: B, openpilot_version: '0.8.12' }] });
  const upload = urls.then((resolved) => store.dispatch(doUpload(A, [PATH], resolved)));
  store.dispatch({ type: ACTION_APPLY_LOCATION, view: { dongleId: B, logId: null, range: null, legacyRange: null, filter: null } });
  store.dispatch(updateFiles(B, { marker: { requested: true } }));
  const files = store.getState().files;
  resolveUrls(['https://example.com/upload']);
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith(A, expect.objectContaining({ method: 'uploadFilesToUrls' })));
  resolveUpload({ result: { failed: [PATH] } });
  await upload;
  expect(store.getState().files).toBe(files);
  expect(rpc).toHaveBeenCalledTimes(1);
});
