import { api } from '../api/backend';
import { fetchFiles } from './files';
import { ACTION_FILES_URLS } from './types';

vi.mock('.', () => ({ updateDeviceOnline: vi.fn(), fetchDeviceNetworkStatus: vi.fn() }));

vi.mock('../api/backend', () => ({
  api: { routes: { getRouteFiles: vi.fn() } },
}));

const publicRoute = '5beb9b58bd12b691|0000010a--a51155e496';
const demoRoute = 'deadbeefdeadbeef|00000000--0000000001';
const publicUrl = 'https://data.example.com/5beb9b58bd12b691/0000010a--a51155e496';

describe('route file listings', () => {
  it.each([publicRoute, demoRoute])('uses asset segment numbers for %s', async (routeName) => {
    const dispatch = vi.fn();
    const qcameras = [0, 12].map((segment) => `${publicUrl}/${segment}/qcamera.ts?sig=test`);
    const qlogs = [`${publicUrl}/2/qlog.zst`];
    api.routes.getRouteFiles.mockResolvedValue({ qcameras, qlogs });

    await fetchFiles(routeName, true)(dispatch);

    expect(api.routes.getRouteFiles).toHaveBeenLastCalledWith(routeName, true);
    expect(dispatch).toHaveBeenCalledWith({
      type: ACTION_FILES_URLS,
      dongleId: routeName.split('|')[0],
      urls: {
        [`${routeName}--0/qcameras`]: { url: qcameras[0] },
        [`${routeName}--12/qcameras`]: { url: qcameras[1] },
        [`${routeName}--2/qlogs`]: { url: qlogs[0] },
      },
    });
  });

  it('accepts relative asset paths and skips invalid segment numbers', async () => {
    const dispatch = vi.fn();
    const valid = '/assets/0/qcamera.ts';
    api.routes.getRouteFiles.mockResolvedValue({ qcameras: [valid, 'http://[invalid', ...[
      'NaN', '-1', '1.5', '1x', '9007199254740992', '',
    ].map((segment) => `/assets/${segment}/qcamera.ts`)] });

    await fetchFiles(demoRoute)(dispatch);

    expect(dispatch).toHaveBeenCalledWith({
      type: ACTION_FILES_URLS,
      dongleId: 'deadbeefdeadbeef',
      urls: { [`${demoRoute}--0/qcameras`]: { url: valid } },
    });
  });
});
