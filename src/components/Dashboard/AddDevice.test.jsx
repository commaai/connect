import { PairDeviceModal } from './AddDevice';

vi.mock('barcode-detector/ponyfill', () => ({ BarcodeDetector: class {} }));

// Browser Back unmounts the routed scanner even while a permission prompt or
// camera decoding operation is outstanding.
describe('pairing camera navigation', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('stops a camera acquired after the modal has closed', async () => {
    let resolveCamera;
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => new Promise((resolve) => { resolveCamera = resolve; }) },
    });
    const modal = new PairDeviceModal({});
    modal.mounted = true;
    modal.state.hasCamera = true;
    modal.videoRef = {};
    const pending = modal.componentDidUpdate();
    modal.componentWillUnmount();
    resolveCamera({ getTracks: () => [{ stop }] });
    await pending;
    expect(stop).toHaveBeenCalledOnce();
    expect(modal.stream).toBeNull();
    expect(modal.scanning).toBe(false);
  });

  test('ignores a QR decode that finishes after closing the modal', async () => {
    let resolveScan;
    const modal = new PairDeviceModal({});
    modal.mounted = true;
    modal.scanning = true;
    modal.videoRef = {};
    modal.detector = { detect: () => new Promise((resolve) => { resolveScan = resolve; }) };
    modal.onQrRead = vi.fn();
    const pending = modal.scanFrame();
    modal.componentWillUnmount();
    resolveScan([{ rawValue: 'late-pair-token' }]);
    await pending;
    expect(modal.onQrRead).not.toHaveBeenCalled();
    expect(modal.scanning).toBe(false);
  });
});
