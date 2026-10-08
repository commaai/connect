import { fetchFiles } from './files';
import { api } from '../api/backend';
import * as Types from './types';

vi.mock('../api/backend', () => ({ api: { routes: { getRouteFiles: vi.fn() } } }));

it('maps public demo asset URLs to the selected synthetic route and segment', async () => {
  const fullname = 'deadbeefdeadbeef|00000000--0000000006';
  const url = 'https://assets.example/v2/real-device/real-route/3/fcamera.hevc?sig=example';
  api.routes.getRouteFiles.mockResolvedValue({ cameras: [url], qlogs: [] });
  const dispatch = vi.fn();
  await fetchFiles(fullname)(dispatch);
  expect(dispatch).toHaveBeenCalledWith({
    type: Types.ACTION_FILES_URLS, dongleId: 'deadbeefdeadbeef',
    urls: { [`${fullname}--3/cameras`]: { url } },
  });
});

it('settles an empty file listing rather than leaving the loading state unset', async () => {
  api.routes.getRouteFiles.mockResolvedValue({});
  const dispatch = vi.fn();
  await fetchFiles('device|route')(dispatch);
  expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_FILES_URLS, dongleId: 'device', urls: {} });
});
