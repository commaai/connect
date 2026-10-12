import { fetchFiles } from './files';
import * as Types from './types';
import { api } from '../api/backend';

vi.mock('../api/backend', () => ({ api: { routes: { getRouteFiles: vi.fn() } } }));
vi.mock('../api', () => ({ athena: {} }));
vi.mock('.', () => ({ updateDeviceOnline: vi.fn(), fetchDeviceNetworkStatus: vi.fn() }));
vi.mock('../utils', () => ({
  deviceOnCellular: vi.fn(), getDeviceFromState: vi.fn(), deviceVersionAtLeast: vi.fn(), asyncSleep: vi.fn(),
}));

describe('fetchFiles', () => {
  it('reads the segment from the url path, whichever route name it carries', async () => {
    // the demo lists the files of a public drive under a different drive's name
    api.routes.getRouteFiles.mockResolvedValue({
      qcameras: ['https://blob.test/qlog/publicdongle/publicroute/0/qcamera.ts?sig=abc'],
      logs: ['https://blob.test/qlog/publicdongle/publicroute/12/rlog.zst'],
    });
    const dispatch = vi.fn();
    await fetchFiles('demodongle|demoroute')(dispatch);
    expect(dispatch).toHaveBeenCalledWith({
      type: Types.ACTION_FILES_URLS,
      dongleId: 'demodongle',
      urls: {
        'demodongle|demoroute--0/qcameras': { url: 'https://blob.test/qlog/publicdongle/publicroute/0/qcamera.ts?sig=abc' },
        'demodongle|demoroute--12/logs': { url: 'https://blob.test/qlog/publicdongle/publicroute/12/rlog.zst' },
      },
    });
  });
});
