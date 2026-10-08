import React from 'react';
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AddDevice } from './AddDevice';
vi.mock('../../actions', () => ({ analyticsEvent: vi.fn(), selectDevice: vi.fn(), updateDevices: vi.fn() }));
vi.mock('../../actions/navigation', () => ({ openModal: vi.fn(), closeModal: vi.fn() }));
vi.mock('../../api/backend', () => ({ api: {} }));

it('releases the camera when Back closes the mounted URL overlay', () => {
  const ref = React.createRef();
  const props = { modalHost: true, classes: {}, devices: [], dispatch: vi.fn() };
  const { rerender } = render(<AddDevice {...props} open ref={ref} />);
  const stop = vi.fn();
  ref.current.stream = { getTracks: () => [{ stop }] };
  ref.current.detector = {};
  ref.current.scanning = true;
  rerender(<AddDevice {...props} open={false} ref={ref} />);
  expect(stop).toHaveBeenCalledOnce();
  expect(ref.current.stream).toBeNull();
  expect(ref.current.detector).toBeNull();
  expect(ref.current.scanning).toBe(false);
});
