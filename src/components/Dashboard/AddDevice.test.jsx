import React from 'react';
import { act, render } from '@testing-library/react';
import { AddDevice } from './AddDevice';

vi.mock('barcode-detector/ponyfill', () => ({ BarcodeDetector: class { detect() { return []; } } }));
vi.mock('../../actions', () => ({
  selectDevice: vi.fn(), updateDevices: vi.fn(), analyticsEvent: vi.fn(),
  openDialog: vi.fn(), closeDialog: vi.fn(),
}));

it('releases a camera stream that arrives after browser navigation closes pairing', async () => {
  let resolveStream;
  const stream = new Promise(resolve => { resolveStream = resolve; });
  const stop = vi.fn();
  const mediaDevices = { enumerateDevices: vi.fn(async () => [{ kind: 'videoinput' }]), getUserMedia: vi.fn(() => stream) };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
  const props = { modalOpen: true, showButton: false, classes: {}, dispatch: vi.fn(), devices: [] };
  const view = render(<AddDevice {...props} />);
  await vi.waitFor(() => expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1));
  view.rerender(<AddDevice {...props} modalOpen={false} />);
  await act(async () => { resolveStream({ getTracks: () => [{ stop }] }); await stream; });
  expect(stop).toHaveBeenCalledOnce();
});
