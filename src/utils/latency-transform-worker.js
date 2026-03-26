// Worker script for RTCRtpScriptTransform (Firefox / standard path).
// Receives encoded video frames, posts timing SEI data back to main thread,
// and forwards frames unchanged.

// Must match TIMING_SEI_UUID in openpilot system/webrtc/device/video.py
const TIMING_SEI_UUID = new Uint8Array([
  0xa5, 0xe0, 0xc4, 0xa4, 0x5b, 0x6e, 0x4e, 0x1e,
  0x9c, 0x7e, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc,
]);

function unescapeRbsp(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    if (i + 2 < data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 3) {
      out.push(0, 0);
      i += 3;
    } else {
      out.push(data[i]);
      i += 1;
    }
  }
  return new Uint8Array(out);
}

function extractTimingSei(frameBuffer) {
  const data = new Uint8Array(frameBuffer);
  let i = 0;

  while (i < data.length - 5) {
    let scLen = 0;
    if (data[i] === 0 && data[i + 1] === 0) {
      if (data[i + 2] === 0 && i + 3 < data.length && data[i + 3] === 1) scLen = 4;
      else if (data[i + 2] === 1) scLen = 3;
    }
    if (scLen === 0) { i += 1; continue; }

    const nalHeaderIdx = i + scLen;
    const nalType = data[nalHeaderIdx] & 0x1f;

    if (nalType === 6) {
      let nalEnd = data.length;
      for (let j = nalHeaderIdx + 1; j < data.length - 2; j++) {
        if (data[j] === 0 && data[j + 1] === 0
          && (data[j + 2] === 1 || (data[j + 2] === 0 && j + 3 < data.length && data[j + 3] === 1))) {
          nalEnd = j;
          break;
        }
      }

      const rbsp = unescapeRbsp(data.slice(nalHeaderIdx + 1, nalEnd));
      let pos = 0;

      let payloadType = 0;
      while (pos < rbsp.length && rbsp[pos] === 0xff) { payloadType += 255; pos += 1; }
      if (pos < rbsp.length) { payloadType += rbsp[pos]; pos += 1; }

      let payloadSize = 0;
      while (pos < rbsp.length && rbsp[pos] === 0xff) { payloadSize += 255; pos += 1; }
      if (pos < rbsp.length) { payloadSize += rbsp[pos]; pos += 1; }

      if (payloadType === 5 && payloadSize >= 48 && pos + 48 <= rbsp.length) {
        let match = true;
        for (let k = 0; k < 16; k++) {
          if (rbsp[pos + k] !== TIMING_SEI_UUID[k]) { match = false; break; }
        }
        if (match) {
          const tsBytes = rbsp.slice(pos + 16, pos + 48);
          const view = new DataView(tsBytes.buffer, tsBytes.byteOffset, 32);
          return {
            captureMs: view.getFloat64(0),
            encodeMs: view.getFloat64(8),
            sendDelayMs: view.getFloat64(16),
            deviceSendWallMs: view.getFloat64(24),
          };
        }
      }
    }

    i = nalHeaderIdx + 1;
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
