import { vi } from 'vitest';
import { devices, request } from './api';

const DONGLE = 'aaaaaaaaaaaaaaaa';

afterEach(() => {
  request.errorResponseCallback = null;
  vi.unstubAllGlobals();
});

describe('device lookup HTTP failures', () => {
  it.each([403, 404, 500])('retains status %s after the global error callback handles the response', async (status) => {
    const response = new Response('Device unavailable', { status });
    const onError = vi.fn();
    request.configure(null, onError);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(devices.fetchDevice(DONGLE)).rejects.toMatchObject({ resp: { status } });
    expect(onError).toHaveBeenCalledWith(response);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/v1.1/devices/${DONGLE}/`),
      expect.objectContaining({ method: 'GET' }));
  });

  it('returns the parsed device on success', async () => {
    const device = { dongle_id: DONGLE, alias: 'My device' };
    const onError = vi.fn();
    request.configure(null, onError);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(device), { status: 200 })));
    await expect(devices.fetchDevice(DONGLE)).resolves.toEqual(device);
    expect(onError).not.toHaveBeenCalled();
  });
});
