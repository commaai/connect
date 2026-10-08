import { render, waitFor } from '@testing-library/react';
import '../../store';
import { PairDeviceScanner } from './AddDevice';

vi.mock('barcode-detector/ponyfill', () => ({ BarcodeDetector: class {} }));

// Browser primitive/command stubs verify cleanup, not physical camera behavior.
it('stops a camera acquired after the pairing modal closes', async () => {
  let resolveCamera;
  const stop = vi.fn();
  const getUserMedia = vi.fn(() => new Promise((resolve) => { resolveCamera = resolve; }));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn(async () => [{ kind: 'videoinput' }]), getUserMedia },
  });
  const props = { classes: {}, dispatch: vi.fn(), devices: [], open: true };
  const view = render(<PairDeviceScanner {...props} />);
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  view.rerender(<PairDeviceScanner {...props} open={false} />);
  resolveCamera({ getTracks: () => [{ stop }] });
  await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  view.unmount();
});

it('stops a camera acquired after the pairing scanner unmounts', async () => {
  let resolveCamera;
  const stop = vi.fn();
  const getUserMedia = vi.fn(() => new Promise((resolve) => { resolveCamera = resolve; }));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn(async () => [{ kind: 'videoinput' }]), getUserMedia },
  });
  const view = render(<PairDeviceScanner classes={{}} dispatch={vi.fn()} devices={[]} open />);
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  view.unmount();
  resolveCamera({ getTracks: () => [{ stop }] });
  await waitFor(() => expect(stop).toHaveBeenCalledOnce());
});

it('discards a QR detection that completes after the pairing modal closes', async () => {
  let resolveDetection;
  const scanner = new PairDeviceScanner({ open: true });
  scanner.mounted = true;
  scanner.scanning = true;
  scanner.videoRef = {};
  scanner.detector = { detect: () => new Promise((resolve) => { resolveDetection = resolve; }) };
  scanner.onQrRead = vi.fn();
  const detection = scanner.scanFrame();
  scanner.props = { open: false };
  scanner.stopCamera();
  resolveDetection([{ rawValue: 'untrusted QR text' }]);
  await detection;
  expect(scanner.onQrRead).not.toHaveBeenCalled();
  expect(scanner.scanFrameId).toBeNull();
});
