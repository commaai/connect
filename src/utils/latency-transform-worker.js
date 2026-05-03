// Worker script for RTCRtpScriptTransform (Firefox / standard path).
// Receives encoded video frames, posts timing SEI data back to main thread,
// and forwards frames unchanged.

// Must match _SEI_PREFIX in openpilot system/webrtc/device/video.py
const SEI_PREFIX = new Uint8Array([
  0x00, 0x00, 0x00, 0x01, 0x06, 0x05, 0x30,
  0xa5, 0xe0, 0xc4, 0xa4, 0x5b, 0x6e, 0x4e, 0x1e,
  0x9c, 0x7e, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc,
]);

export function extractTimingSei(frameBuffer) {
  const data = new Uint8Array(frameBuffer);

  outer:
  for (let i = 0; i <= data.length - SEI_PREFIX.length - 32; i++) {
    for (let k = 0; k < SEI_PREFIX.length; k++) {
      if (data[i + k] !== SEI_PREFIX[k]) continue outer;
    }
    const tsOffset = i + SEI_PREFIX.length;
    const view = new DataView(data.buffer, data.byteOffset + tsOffset, 32);
    return {
      captureMs: view.getFloat64(0),
      encodeMs: view.getFloat64(8),
      sendDelayMs: view.getFloat64(16),
      deviceSendWallMs: view.getFloat64(24),
    };
  }
  return null;
}

// Handle RTCRtpScriptTransform event
// eslint-disable-next-line no-restricted-globals
self.onrtctransform = (event) => {
  const { readable, writable } = event.transformer;
  readable.pipeThrough(new TransformStream({
    transform(frame, controller) {
      const timing = extractTimingSei(frame.data);
      if (timing) {
        // eslint-disable-next-line no-restricted-globals
        self.postMessage({ type: 'timing', timing });
      }
      controller.enqueue(frame);
    },
  })).pipeTo(writable);
};
