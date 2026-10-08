import { vi } from 'vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import DriveMap from '.';
import { reducer, seek, videoProgress } from '../../timeline/playback';

const bridge = vi.hoisted(() => ({ store: null, map: null, frame: null }));
vi.mock('../../timeline', () => ({ currentOffset: () => bridge.store.getState().offset }));
vi.mock('../../actions/cached', () => ({ fetchDriveCoords: () => ({ type: 'FETCH_COORDS' }) }));
vi.mock('react-map-gl', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    LinearInterpolator: class {},
    default: forwardRef((props, ref) => {
      useImperativeHandle(ref, () => ({ getMap: () => bridge.map }), []);
      return React.createElement('div', {
        'data-testid': 'map', 'data-longitude': props.longitude, 'data-latitude': props.latitude,
      });
    }),
  };
});

it('renders the marker from media position and accepts the first seek command', () => {
  let onLoad;
  const marker = { setData: vi.fn() };
  const path = { setData: vi.fn() };
  bridge.map = {
    on: (_event, callback) => { onLoad = callback; },
    addSource: vi.fn(), addLayer: vi.fn(),
    getSource: (name) => name === 'seekPoint' ? marker : path,
  };
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { bridge.frame = callback; return 1; });
  const initial = {
    offset: 0, seekVersion: 0, desiredPlaySpeed: 1, loop: null,
    currentRoute: {
      fullname: 'device/route', duration: 10000,
      driveCoords: { 0: [100, 40], 1: [102, 42], 2: [104, 44] },
    },
  };
  bridge.store = createStore((state = initial, action) => reducer(state, action));
  render(React.createElement(Provider, { store: bridge.store }, React.createElement(DriveMap)));
  act(() => onLoad());
  act(() => bridge.store.dispatch(videoProgress(1500, 'device/route', 0)));
  act(() => bridge.frame());
  expect(marker.setData).toHaveBeenLastCalledWith({ type: 'Point', coordinates: [103, 43] });
  expect(screen.getByTestId('map')).toHaveAttribute('data-longitude', '103');
  act(() => bridge.store.dispatch(seek(500)));
  act(() => bridge.frame());
  expect(marker.setData).toHaveBeenLastCalledWith({ type: 'Point', coordinates: [101, 41] });
  expect(screen.getByTestId('map')).toHaveAttribute('data-longitude', '101');
  vi.restoreAllMocks();
});
