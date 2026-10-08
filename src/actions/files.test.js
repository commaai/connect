import { vi } from 'vitest';
import { fetchFiles } from './files';

const mocks = vi.hoisted(() => ({
  getRouteFiles: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('../api/backend', () => ({
  api: { routes: { getRouteFiles: mocks.getRouteFiles } },
}));

vi.mock('@sentry/react', () => ({
  captureException: mocks.captureException,
}));

vi.mock('../utils', () => ({
  asyncSleep: vi.fn(),
  deviceOnCellular: vi.fn(),
  deviceVersionAtLeast: vi.fn(),
  getDeviceFromState: vi.fn(),
}));

vi.mock('./index', () => ({
  fetchDeviceNetworkStatus: vi.fn(),
  updateDeviceOnline: vi.fn(),
}));

const ROUTE = '0000aaaa0000aaaa|2026-08-06--12-00-00';

describe('fetchFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches route file URLs and resolves successfully', async () => {
    mocks.getRouteFiles.mockResolvedValue({});
    const dispatch = vi.fn();

    await expect(fetchFiles(ROUTE)(dispatch)).resolves.toBe(true);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ACTION_FILES_URLS',
      dongleId: '0000aaaa0000aaaa',
      urls: {},
    });
  });

  it('reports a failed request so the Files menu can offer retry', async () => {
    const error = new Error('network offline');
    mocks.getRouteFiles.mockRejectedValue(error);
    const dispatch = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(fetchFiles(ROUTE)(dispatch)).resolves.toBe(false);

    expect(dispatch).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(error);
    expect(mocks.captureException).toHaveBeenCalledWith(error, {
      fingerprint: 'action_files_fetch_files',
    });
    consoleError.mockRestore();
  });

  it('bypasses the cached route-files response on retry', async () => {
    mocks.getRouteFiles.mockResolvedValue({});
    const dispatch = vi.fn();

    await expect(fetchFiles(ROUTE, true)(dispatch)).resolves.toBe(true);

    expect(mocks.getRouteFiles).toHaveBeenCalledWith(ROUTE, true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ACTION_FILES_URLS',
      dongleId: '0000aaaa0000aaaa',
      urls: {},
    });
  });

  it('treats an invalid files response as a failure', async () => {
    mocks.getRouteFiles.mockResolvedValue(null);
    const dispatch = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(fetchFiles(ROUTE)(dispatch)).resolves.toBe(false);

    expect(dispatch).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid route files response' }),
      { fingerprint: 'action_files_fetch_files' },
    );
    consoleError.mockRestore();
  });
});
