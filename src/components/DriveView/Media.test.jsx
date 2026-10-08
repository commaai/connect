import { Media } from './Media';

vi.mock('../../actions/files', () => ({
  FILE_NAMES: {},
  setRouteViewed: vi.fn(),
  fetchFiles: vi.fn((routeName, forceRefresh) => ({ type: 'FETCH_FILES', routeName, forceRefresh })),
  doUpload: vi.fn(),
  fetchUploadUrls: vi.fn(),
  fetchAthenaQueue: vi.fn(),
  updateFiles: vi.fn(),
}));

describe('Media route-file retry', () => {
  it('keeps retry feedback visible until the forced reload completes', async () => {
    let resolveFiles;
    const dispatch = vi.fn(() => new Promise((resolve) => {
      resolveFiles = resolve;
    }));
    const media = new Media({
      dispatch,
      currentRoute: { fullname: 'device|route' },
    });
    media.mounted = true;
    media.state.filesError = 'Unable to load route files. Check your connection and retry.';
    media.setState = (update) => {
      media.state = { ...media.state, ...(typeof update === 'function' ? update(media.state) : update) };
    };

    const request = media.loadRouteFiles('device|route', true);

    expect(media.state.filesRetrying).toBe(true);
    expect(media.state.filesError).toBe('Unable to load route files. Check your connection and retry.');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'FETCH_FILES',
      routeName: 'device|route',
      forceRefresh: true,
    });

    resolveFiles(false);
    await request;

    expect(media.state.filesRetrying).toBe(false);
    expect(media.state.filesLoading).toBe(false);
    expect(media.state.filesError).toBe('Unable to load route files. Check your connection and retry.');
  });
});
