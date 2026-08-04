/* eslint-env jest */
import { WebRTCConnection } from './webrtc';

const callbacks = () => ({
  onConnectionState: jest.fn(),
  onBatteryLevel: jest.fn(),
  onSoundDeviceState: jest.fn(),
  onVideoTrack: jest.fn(),
});

describe('WebRTC sound device messages', () => {
  it('accepts soundDeviceState messages from openpilot', () => {
    const handlers = callbacks();
    const connection = new WebRTCConnection(handlers);
    const state = {
      devices: [{ id: 0, name: 'Built-in Audio', isDefault: true }],
      selectedDeviceId: 0,
    };

    connection._handleDataChannelMessage(JSON.stringify({ type: 'soundDeviceState', data: state }));

    expect(handlers.onSoundDeviceState).toHaveBeenCalledWith(state);
  });

  it('sends integer selections as soundDeviceCommand messages', () => {
    const connection = new WebRTCConnection(callbacks());
    connection.dc = { readyState: 'open', send: jest.fn() };

    expect(connection.setSoundDevice(4)).toBe(true);
    expect(connection.dc.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'soundDeviceCommand',
      data: { deviceId: 4 },
    }));
    expect(connection.setSoundDevice('4')).toBe(false);
    expect(connection.dc.send).toHaveBeenCalledTimes(1);
  });

  it('can change outputs while file audio is active', () => {
    const connection = new WebRTCConnection(callbacks());
    connection.dc = { readyState: 'open', send: jest.fn() };
    connection.audioFilePlayback = { source: {} };

    expect(connection.setSoundDevice(2)).toBe(true);
    expect(connection.audioFilePlayback).not.toBeNull();
    expect(connection.dc.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'soundDeviceCommand',
      data: { deviceId: 2 },
    }));
  });
});

describe('WebRTC audio file cleanup', () => {
  it('stops file playback when the connection is cleaned up', () => {
    const source = { stop: jest.fn(), onended: jest.fn() };
    const track = { stop: jest.fn() };
    const context = { close: jest.fn().mockResolvedValue() };
    const connection = new WebRTCConnection(callbacks());
    connection.audioEnabled = true;
    connection.audioSender = { replaceTrack: jest.fn().mockResolvedValue() };
    connection.audioFilePlayback = { source, track, context };
    connection._silentAudioTrack = jest.fn(() => null);

    connection.cleanup();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(connection.audioFilePlayback).toBeNull();
  });
});

describe('WebRTC audio offer', () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const originalRtpSender = Object.getOwnPropertyDescriptor(globalThis, 'RTCRtpSender');

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    } else {
      delete navigator.mediaDevices;
    }
    if (originalRtpSender) {
      Object.defineProperty(globalThis, 'RTCRtpSender', originalRtpSender);
    } else {
      delete globalThis.RTCRtpSender;
    }
  });

  it('offers a microphone track as sendonly audio', async () => {
    const track = { id: 'microphone', kind: 'audio', muted: false, readyState: 'live' };
    const stream = { getAudioTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
    });

    const opus = { mimeType: 'audio/opus' };
    Object.defineProperty(globalThis, 'RTCRtpSender', {
      configurable: true,
      value: { getCapabilities: jest.fn(() => ({ codecs: [opus, { mimeType: 'audio/red' }] })) },
    });
    const transceiver = { receiver: {}, sender: {}, setCodecPreferences: jest.fn() };
    const connection = new WebRTCConnection(callbacks());
    connection.pc = { addTransceiver: jest.fn(() => transceiver) };

    await connection._setupAudioForOffer(connection.pc, true);

    expect(connection.pc.addTransceiver).toHaveBeenCalledWith(track, {
      direction: 'sendonly',
      streams: [stream],
    });
    expect(connection.audioSender).toBe(transceiver.sender);
    expect(transceiver.setCodecPreferences).toHaveBeenCalledWith([opus]);
  });

  it('offers the silent fallback as sendonly audio', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const track = { id: 'silent', kind: 'audio', muted: false, readyState: 'live' };
    const stream = { getAudioTracks: () => [track] };
    const transceiver = { receiver: {}, sender: {} };
    const connection = new WebRTCConnection(callbacks());
    connection.silentAudio = { stream, track };
    connection._silentAudioTrack = jest.fn(() => track);
    connection.pc = { addTransceiver: jest.fn(() => transceiver) };

    await connection._setupAudioForOffer(connection.pc, true);

    expect(connection.pc.addTransceiver).toHaveBeenCalledWith(track, {
      direction: 'sendonly',
      streams: [stream],
    });
    expect(connection.audioSender).toBe(transceiver.sender);
  });
});
