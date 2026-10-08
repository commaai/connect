import { vi } from 'vitest';
import { api } from '../api/backend';
import { createDemoBackend, DEMO_DONGLE_ID, PUBLIC_ROUTE_DONGLE_ID, PUBLIC_ROUTE_LOG_ID } from '../api/demo';
import { fetchFiles } from './files';
import { ACTION_FILES_URLS } from './types';

vi.mock('../api/backend', () => ({
  api: { routes: { getRouteFiles: vi.fn() } },
}));
vi.mock('../store', () => ({ default: { getState: vi.fn() } }));

describe('fetchFiles', () => {
  const publicRoute = `${PUBLIC_ROUTE_DONGLE_ID}|${PUBLIC_ROUTE_LOG_ID}`;
  const demoRoute = `${DEMO_DONGLE_ID}|00000000--0000000004`;
  const baseUrl = `https://data.example.com/${PUBLIC_ROUTE_DONGLE_ID}/${PUBLIC_ROUTE_LOG_ID}`;
  const files = {
    cameras: [`${baseUrl}/0/fcamera.hevc?sig=keep/this&exp=123`],
    logs: [`${baseUrl}/12/rlog.zst`],
    qcameras: [`${baseUrl}/12/qcamera.ts`],
  };

  it.each([
    ['public', publicRoute],
    ['demo', demoRoute],
  ])('loads %s route files using their segment paths while preserving download URLs', async (_label, route) => {
    const getRouteFiles = vi.fn().mockResolvedValue(files);
    const backend = createDemoBackend({ routes: { getRouteFiles } });
    api.routes.getRouteFiles.mockImplementation(backend.routes.getRouteFiles);
    const dispatch = vi.fn();

    await fetchFiles(route)(dispatch);

    expect(getRouteFiles.mock.calls[0][0]).toBe(publicRoute);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: ACTION_FILES_URLS,
      dongleId: route.split('|')[0],
      urls: {
        [`${route}--0/cameras`]: { url: files.cameras[0] },
        [`${route}--12/logs`]: { url: files.logs[0] },
        [`${route}--12/qcameras`]: { url: files.qcameras[0] },
      },
    });
  });
});
