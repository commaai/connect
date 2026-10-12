import React from 'react';
import { Provider } from 'react-redux';
import { act, render } from '@testing-library/react';

import DriveMap from '.';

const mapGl = vi.hoisted(() => ({ props: null }));
const clock = vi.hoisted(() => ({ offset: 0 }));
const setData = vi.hoisted(() => vi.fn());

vi.mock('react-map-gl', () => ({
  default: React.forwardRef((props, ref) => {
    mapGl.props = props;
    // one handle for the component's lifetime, like the real map (a new one per render would re-run the load handler)
    React.useImperativeHandle(ref, () => ({
      getMap: () => ({
        on: (_event, load) => load(),
        addSource: () => {},
        addLayer: () => {},
        getSource: () => ({ setData }),
      }),
    }), []);
    return <div />;
  }),
}));
vi.mock('../../actions/cached', () => ({ fetchDriveCoords: () => ({ type: 'coords' }) }));
vi.mock('../../timeline', () => ({ currentOffset: () => clock.offset }));

// the car drives east one step per second
const driveCoords = Object.fromEntries([0, 1, 2, 3, 4, 5].map((second) => [second, [10 + second, 20]]));
const route = { fullname: 'dongle|log', driveCoords };

const lng = () => mapGl.props.longitude;
const run = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const interact = (state) => act(() => mapGl.props.onInteractionStateChange(state));

let state = { offset: 0, currentRoute: route, seekId: 0 };
const listeners = [];
const store = { getState: () => state, subscribe: (listener) => { listeners.push(listener); return () => {}; }, dispatch: vi.fn() };
const renderMap = () => render(<Provider store={store}><DriveMap /></Provider>);

describe('DriveMap camera', () => {
  beforeEach(() => {
    setData.mockClear();
    vi.useFakeTimers();
    clock.offset = 1000;
  });
  afterEach(() => {
    vi.useRealTimers();
    state = { ...state, currentRoute: route };
  });

  it('follows the car as the video plays', () => {
    renderMap();
    run(200);
    expect(lng()).toBe(11);
    clock.offset = 3000;
    run(200);
    expect(lng()).toBe(13);
  });

  it('shows the car where it was last seen during a GPS gap, not the default location', () => {
    state = { ...state, currentRoute: { ...route, driveCoords: { 0: [10, 20], 1: [11, 20], 4: [14, 20], 5: [15, 20] } } };
    clock.offset = 2500; // mounted mid-gap, as after rotating a phone
    renderMap();
    run(200);
    expect(lng()).toBe(11);
  });

  it('can still be dragged after zooming (the controller never resets isZooming)', () => {
    renderMap();
    run(200);
    interact({ isPanning: true, isZooming: true }); // a wheel zoom
    run(300);
    interact({ isDragging: true, isPanning: true, isZooming: true }); // the drag that follows
    interact({ isDragging: false, isPanning: false }); // and its end
    clock.offset = 4000;
    run(1000);
    expect(lng()).toBe(11); // the camera stays where the user put it...
    run(5000);
    expect(lng()).toBe(14); // ...and returns to the car after the pause
  });

  it('keeps its hands off the camera while zooming, then recentres once', () => {
    renderMap();
    run(200);
    interact({ isPanning: true, isZooming: true });
    clock.offset = 2000;
    run(100);
    expect(lng()).toBe(11);
    run(300);
    expect(lng()).toBe(12);
  });

  it('follows right away after a seek, even just after panning', () => {
    renderMap();
    run(200);
    interact({ isDragging: true, isPanning: true });
    interact({ isDragging: false, isPanning: false });
    clock.offset = 5000;
    run(300);
    expect(lng()).toBe(11);
    state = { ...state, seekId: state.seekId + 1 }; // connect() only re-reads state when it is a new object
    act(() => listeners.forEach((listener) => listener()));
    run(200);
    expect(lng()).toBe(15);
  });

  it('lets mapbox draw once per frame and glides nowhere after a pinch', () => {
    renderMap();
    expect(mapGl.props.asyncRender).toBe(true); // otherwise react-map-gl draws synchronously on every touch move
    expect(mapGl.props.touchZoom).toEqual({ inertia: 0 }); // see pinch.test.js
  });

  it('leaves the map alone while a finger is on it, then catches up', () => {
    renderMap();
    run(200);
    interact({ isDragging: true, isPanning: true });
    run(100);
    const drawsBefore = setData.mock.calls.length;
    clock.offset = 3000;
    run(500);
    expect(setData.mock.calls.length).toBe(drawsBefore); // no marker updates mid-gesture
    interact({ isDragging: false, isPanning: false });
    run(200);
    expect(setData.mock.calls.length).toBeGreaterThan(drawsBefore); // the marker is brought up to date
  });

  it('does not stay frozen if a gesture end is never reported', () => {
    renderMap();
    run(200);
    interact({ isDragging: true, isPanning: true });
    clock.offset = 3000;
    run(500);
    const frozen = setData.mock.calls.length;
    run(2500); // the end never comes
    expect(setData.mock.calls.length).toBeGreaterThan(frozen);
  });
});
