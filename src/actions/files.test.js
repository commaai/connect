import { vi } from 'vitest';
import { athena as Athena } from '../api';
import { cancelFetchUploadQueue, fetchUploadQueue } from './files';

vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('../timeline/playback', () => ({ reducer: (state) => state }));

const DONGLE = '0000aaaa0000aaaa';

function upload(fields = {}) {
  return {
    id: '0',
    url: `https://upload.example.com/${DONGLE}/2026-08-06--12-00-00/0/qcamera.ts?sig=x`,
    current: false,
    allow_cellular: false,
    ...fields,
  };
}

function startPolling(networkMetered, queue) {
  const device = { dongle_id: DONGLE, openpilot_version: '0.11.2', network_metered: networkMetered };
  const getState = () => ({ dongleId: DONGLE, device, devices: [device], filesUploading: {} });
  const dispatch = (action) => (typeof action === 'function' ? action(dispatch, getState) : action);
  Athena.postJsonRpcPayload.mockImplementation(async (_dongleId, { method }) => ({
    result: method === 'listUploadQueue' ? queue : networkMetered,
  }));
  dispatch(fetchUploadQueue(DONGLE));
}

const calls = (method) => Athena.postJsonRpcPayload.mock.calls.filter(([, p]) => p.method === method).length;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cancelFetchUploadQueue();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('upload queue polling', () => {
  it('stops when every upload is waiting for wifi', async () => {
    startPolling(true, [upload()]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls('listUploadQueue')).toBe(1);
  });

  it('checks the network type once while an upload is progressing', async () => {
    startPolling(false, [upload({ current: true, progress: 0.5 })]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls('listUploadQueue')).toBe(31);
    expect(calls('getNetworkMetered')).toBe(1);
  });

  it('makes no athena calls while the tab is hidden', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    startPolling(false, [upload({ current: true })]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(Athena.postJsonRpcPayload).not.toHaveBeenCalled();
  });
});
