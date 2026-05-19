/* eslint-env jest */
import { BodyTeleopConnection } from './bodyteleop';

const callbacks = {
  onConnectionState: jest.fn(),
};

describe('BodyTeleopConnection artificial latency', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('delays joystick messages after they are generated', () => {
    const sent = [];
    const conn = new BodyTeleopConnection(callbacks);
    conn.dc = {
      readyState: 'open',
      send: (payload) => sent.push(JSON.parse(payload)),
    };

    conn.setArtificialLatency(100);
    conn.setJoystick(1, 0);
    conn.sendJoystick();

    jest.advanceTimersByTime(50);
    conn.setJoystick(0, 1);
    conn.sendJoystick();

    expect(sent).toEqual([]);

    jest.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);
    expect(sent[0].data.axes).toEqual([1, 0]);

    jest.advanceTimersByTime(50);
    expect(sent).toHaveLength(2);
    expect(sent[1].data.axes).toEqual([0, 1]);
  });

  it('sends the current joystick sample when artificial latency is zero', () => {
    const sent = [];
    const conn = new BodyTeleopConnection(callbacks);
    conn.dc = {
      readyState: 'open',
      send: (payload) => sent.push(JSON.parse(payload)),
    };

    conn.setJoystick(0.25, -0.5);
    conn.sendJoystick();

    expect(sent[sent.length - 1].data.axes).toEqual([0.25, -0.5]);
  });

  it('clears pending delayed joystick messages on cleanup', () => {
    const sent = [];
    const conn = new BodyTeleopConnection(callbacks);
    conn.dc = {
      readyState: 'open',
      send: (payload) => sent.push(JSON.parse(payload)),
      close: jest.fn(),
    };

    conn.setArtificialLatency(100);
    conn.setJoystick(1, 0);
    conn.sendJoystick();
    conn.cleanup();

    jest.advanceTimersByTime(100);
    expect(sent).toEqual([]);
  });

  it('applies receiver video delay with each API unit when frame delay is unavailable', () => {
    const conn = new BodyTeleopConnection(callbacks);
    const receiver = { playoutDelayHint: 0, jitterBufferTarget: 0 };

    conn.videoReceiver = receiver;
    conn.setArtificialLatency(250);

    expect(receiver.playoutDelayHint).toBe(0.25);
    expect(receiver.jitterBufferTarget).toBe(250);
  });

  it('does not stack receiver video delay on top of decoded frame delay', () => {
    const conn = new BodyTeleopConnection(callbacks);
    const receiver = { playoutDelayHint: 1, jitterBufferTarget: 1000 };

    conn.videoFrameDelay = {};
    conn.videoReceiver = receiver;
    conn.setArtificialLatency(250);

    expect(receiver.playoutDelayHint).toBe(0);
    expect(receiver.jitterBufferTarget).toBe(0);
  });
});
