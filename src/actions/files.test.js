import { fetchFiles } from './files';
import { api } from '../api/backend';
import { ACTION_FILES_URLS } from './types';

vi.mock('../api', () => ({ athena: {} }));
vi.mock('../api/backend', () => ({ api: { routes: { getRouteFiles: vi.fn() } } }));
vi.mock('./index', () => ({ updateDeviceOnline: vi.fn(), fetchDeviceNetworkStatus: vi.fn() }));
vi.mock('../utils', () => ({}));

it('takes the segment from the file directory, ignoring parent numbers and signed query strings', async () => {
  api.routes.getRouteFiles.mockResolvedValue({
    qcameras: ['https://assets.test/2026/dongle/log/7/qcamera.ts?expires=123&sig=456',
      'https://assets.test/2026/dongle/log/0/qcamera.ts?sig=123'],
    qlogs: ['https://assets.test/2026/dongle/log/7/qlog.zst'],
  });
  const dispatch = vi.fn();
  await fetchFiles('dongle|log')(dispatch);
  expect(dispatch).toHaveBeenCalledWith({ type: ACTION_FILES_URLS, dongleId: 'dongle', urls: {
    'dongle|log--7/qcameras': { url: 'https://assets.test/2026/dongle/log/7/qcamera.ts?expires=123&sig=456' },
    'dongle|log--0/qcameras': { url: 'https://assets.test/2026/dongle/log/0/qcamera.ts?sig=123' },
    'dongle|log--7/qlogs': { url: 'https://assets.test/2026/dongle/log/7/qlog.zst' },
  } });
});

it('skips malformed file lists and URLs without losing the valid entries', async () => {
  api.routes.getRouteFiles.mockResolvedValue({
    qcameras: [null, 'invalid', 'https://assets.test/not-a-segment/qcamera.ts',
      'https://assets.test/99999999999999999999/qcamera.ts', 'https://assets.test/1/qcamera.ts'],
    qlogs: { invalid: true },
  });
  const dispatch = vi.fn();
  await fetchFiles('dongle|log')(dispatch);
  expect(dispatch.mock.calls[0][0].urls).toEqual({
    'dongle|log--1/qcameras': { url: 'https://assets.test/1/qcamera.ts' },
  });
});
