import { parseRemoteDescription } from './webrtc';

const sdp = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n';

describe('parseRemoteDescription', () => {
  test('parses the current startStream response', () => {
    expect(parseRemoteDescription({ result: { type: 'answer', sdp } }))
      .toEqual({ type: 'answer', sdp: sdp.trim() });
  });

  test('parses a JSON-encoded JSON-RPC result', () => {
    expect(parseRemoteDescription({ result: JSON.stringify({ type: 'answer', sdp }) }))
      .toEqual({ type: 'answer', sdp: sdp.trim() });
  });

  test('parses a nested session description', () => {
    expect(parseRemoteDescription({ result: { sdp: { type: 'answer', sdp } } }))
      .toEqual({ type: 'answer', sdp: sdp.trim() });
  });

  test('rejects a missing or malformed SDP before calling the browser API', () => {
    expect(() => parseRemoteDescription({ result: { error: 'bad answer' } }))
      .toThrow('Device returned an invalid WebRTC answer');
  });
});
