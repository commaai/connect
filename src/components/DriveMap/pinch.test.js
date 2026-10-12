import MapController from 'react-map-gl/dist/es6/utils/map-controller';

// react-map-gl 5 glides after a pinch ends. It works out the glide speed by dividing by the time between the
// last pinch event and the end event; on an iPhone those often fall in the same millisecond, the speed becomes
// -Infinity, the end scale 0, and the library throws "`scale` must be a positive number" inside a touch listener,
// leaving the map stuck mid-gesture. DriveMap turns the glide off, which is what this pins down.
const viewport = { width: 300, height: 200, latitude: 32.7, longitude: -117.1, zoom: 15, minZoom: 10, maxZoom: 19 };

function pinchIn(touchZoom) {
  const controller = new MapController();
  controller.setOptions({ ...viewport, touchZoom, onViewportChange: () => {}, onStateChange: () => {} });
  const touch = { offsetCenter: { x: 150, y: 100 }, rotation: 0, srcEvent: {} };
  controller.handleEvent({ type: 'pinchstart', ...touch, scale: 1, deltaTime: 0 });
  controller.handleEvent({ type: 'pinchmove', ...touch, scale: 0.6, deltaTime: 120 });
  // the finger lifts in the same millisecond as the last move, at a slightly smaller scale
  controller.handleEvent({ type: 'pinchend', ...touch, scale: 0.55, deltaTime: 120 });
  return controller;
}

describe('pinch-zoom end on iPhone timing', () => {
  it('throws with the library default (documents the bug)', () => {
    expect(() => pinchIn(true)).toThrow('`scale` must be a positive number');
  });

  it('does not throw, and leaves the map ready for the next gesture, with the glide off', () => {
    const controller = pinchIn({ inertia: 0 });
    expect(controller._interactionState.isDragging).toBe(false);
    expect(controller._eventStartBlocked).toBeFalsy(); // no 300 ms dead time before the next pinch
  });
});
