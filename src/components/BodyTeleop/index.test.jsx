import React from 'react';
import { act, render, screen } from '@testing-library/react';

import { BodyTeleop } from './index';

const mocks = vi.hoisted(() => ({ callbacks: null, fetchDeviceNotCar: vi.fn() }));

vi.mock('../../actions', () => ({
  fetchDeviceNotCar: mocks.fetchDeviceNotCar,
}));
vi.mock('../../hooks/window', () => ({ useIsLandscape: () => false }));
vi.mock('../../utils/webrtc', () => ({
  webrtcConnectionManager: {
    acquire: vi.fn((_dongleId, callbacks) => {
      mocks.callbacks = callbacks;
      return { setQuality: vi.fn(), switchCamera: vi.fn() };
    }),
    connection: null,
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    release: vi.fn(),
  },
}));
vi.mock('./StatusBar', () => ({ default: () => <div data-testid="status-bar" /> }));
vi.mock('./ControlsBar', () => ({ default: () => <div data-testid="controls-bar" /> }));
vi.mock('./Joystick', () => ({ default: () => <div data-testid="joystick" /> }));
vi.mock('./Video', () => ({
  default: ({ started }) => <div data-testid="video" data-pinch-enabled={String(!started)} />,
}));

const dongleId = 'aaaaaaaaaaaaaaaa';

function makeDevice(notCar, online = true) {
  const rpc = notCar === undefined ? {} : { not_car: notCar };
  return {
    alias: 'test device', dongle_id: dongleId, rpc,
    ...(online ? { fetched_at: 1_000, last_athena_ping: 1_000 } : {}),
  };
}

function renderTeleop(notCar) {
  const dispatch = vi.fn();
  render(
    <BodyTeleop
      dongleId={dongleId}
      device={makeDevice(notCar)}
      dispatch={dispatch}
    />,
  );
  act(() => mocks.callbacks.onConnectionState('connected'));
  return { dispatch };
}

function setIgnition(started) {
  act(() => mocks.callbacks.onIgnition(started));
}

describe('body teleop classification gating', () => {
  beforeEach(() => {
    mocks.callbacks = null;
    mocks.fetchDeviceNotCar.mockReset();
    mocks.fetchDeviceNotCar.mockReturnValue({ type: 'FETCH_DEVICE_NOT_CAR' });
  });

  test('identifies a device when teleop opens without a classification', () => {
    const { dispatch } = renderTeleop(undefined);
    expect(mocks.fetchDeviceNotCar).toHaveBeenCalledWith(dongleId);
    expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_DEVICE_NOT_CAR' });
  });

  test('identifies after a cold-start device transitions online', () => {
    const dispatch = vi.fn();
    const { rerender } = render(
      <BodyTeleop dongleId={dongleId} device={makeDevice(undefined, false)} dispatch={dispatch} />,
    );
    expect(dispatch).not.toHaveBeenCalled();

    rerender(<BodyTeleop dongleId={dongleId} device={makeDevice(undefined, true)} dispatch={dispatch} />);
    expect(mocks.fetchDeviceNotCar).toHaveBeenCalledWith(dongleId);
    expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_DEVICE_NOT_CAR' });
  });

  test.each([
    ['pending classification', undefined],
    ['confirmed car', false],
  ])('%s does not enable body controls when ignition is on', (_name, notCar) => {
    renderTeleop(notCar);
    setIgnition(true);
    expect(screen.queryByTestId('joystick')).not.toBeInTheDocument();
    expect(screen.queryByText('Turn on comma body ignition to remote control')).not.toBeInTheDocument();
    expect(screen.getByTestId('video')).toHaveAttribute('data-pinch-enabled', 'true');
  });

  test('confirmed body with ignition off shows the prompt', () => {
    renderTeleop(true);
    expect(screen.getByText('Turn on comma body ignition to remote control')).toBeInTheDocument();
    expect(screen.queryByTestId('joystick')).not.toBeInTheDocument();
    expect(screen.getByTestId('video')).toHaveAttribute('data-pinch-enabled', 'true');
  });

  test('confirmed body with ignition on shows controls and disables pinch zoom', () => {
    renderTeleop(true);
    setIgnition(true);
    expect(screen.getByTestId('joystick')).toBeInTheDocument();
    expect(screen.queryByText('Turn on comma body ignition to remote control')).not.toBeInTheDocument();
    expect(screen.getByTestId('video')).toHaveAttribute('data-pinch-enabled', 'false');
  });
});
