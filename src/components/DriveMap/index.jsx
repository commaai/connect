import { useCallback, useEffect, useRef } from 'react';
import { connect } from 'react-redux';

import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset } from '../../timeline';
import { createMap } from '../../utils/mapbox';

const INTERACTION_TIMEOUT = 5000;

const createRouteData = (coordinates = []) => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates,
  },
});

const createPointData = (coordinates = []) => ({
  type: 'Point',
  coordinates,
});

const posAtOffset = (offset, coords, range) => {
  const { min: driveCoordsMin, max: driveCoordsMax } = range;

  const offsetSeconds = Math.floor(offset / 1e3);
  const offsetFractionalPart = (offset % 1e3) / 1000.0;
  const coordIdx = Math.max(driveCoordsMin, Math.min(offsetSeconds, driveCoordsMax));
  const nextCoordIdx = Math.max(driveCoordsMin, Math.min(offsetSeconds + 1, driveCoordsMax));

  if (!coords[coordIdx]) return null;

  const [floorLng, floorLat] = coords[coordIdx];
  const [ceilLng, ceilLat] = coords[nextCoordIdx] || coords[coordIdx];

  return [
    floorLng + ((ceilLng - floorLng) * offsetFractionalPart),
    floorLat + ((ceilLat - floorLat) * offsetFractionalPart),
  ];
};

const DriveMap = ({ dispatch, currentRoute, startTime }) => {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const shouldAnimateRef = useRef(false);
  const lastPositionRef = useRef(null);
  const coordRangeRef = useRef({ min: null, max: null });
  const routeRef = useRef(currentRoute);
  const prevStartTimeRef = useRef(startTime);

  const routeFullname = currentRoute?.fullname || null;
  const driveCoords = currentRoute?.driveCoords;

  const setPath = useCallback((coords) => {
    mapRef.current?.getSource('route')?.setData(createRouteData(coords));
  }, []);

  const applyDriveCoords = useCallback((coords) => {
    if (!coords || !mapRef.current) return;

    shouldAnimateRef.current = false;
    const indices = Object.keys(coords).map(Number);
    coordRangeRef.current = {
      min: Math.min(...indices),
      max: Math.max(...indices),
    };
    setPath(Object.values(coords));
  }, [setPath]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const map = createMap(element, { zoom: 14 });
    mapRef.current = map;

    let frameId = null;
    let resumeAt = 0;

    const markInteraction = () => {
      shouldAnimateRef.current = true;
      resumeAt = performance.now() + INTERACTION_TIMEOUT;
    };

    const moveViewportTo = (pos) => {
      if (performance.now() < resumeAt) return;

      if (shouldAnimateRef.current) {
        map.easeTo({
          center: pos,
          duration: 200,
          easing: (t) => t,
        });
        shouldAnimateRef.current = false;
      } else {
        map.jumpTo({ center: pos });
      }
    };

    const updateMarkerPos = () => {
      const markerSource = map.getSource('seekPoint');
      if (markerSource) {
        const coords = routeRef.current?.driveCoords;
        const pos = coords ? posAtOffset(currentOffset(), coords, coordRangeRef.current) : null;
        const lastPos = lastPositionRef.current;

        if (pos && (!lastPos || pos.some((coordinate, index) => coordinate !== lastPos[index]))) {
          lastPositionRef.current = pos;
          markerSource.setData(createPointData(pos));
          moveViewportTo(pos);
        } else if (!pos && lastPos) {
          lastPositionRef.current = null;
          markerSource.setData(createPointData());
        }
      }

      frameId = requestAnimationFrame(updateMarkerPos);
    };

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(element);

    const stopTouchPropagation = (event) => event.stopPropagation();
    element.addEventListener('touchstart', stopTouchPropagation);

    element.addEventListener('pointerdown', markInteraction, true);
    element.addEventListener('wheel', markInteraction, { capture: true, passive: true });

    map.on('move', (event) => {
      if (!event.originalEvent || event.originalEvent.type === 'resize') return;
      markInteraction();
    });

    map.once('load', () => {
      if (mapRef.current !== map) return;

      map.addSource('route', {
        type: 'geojson',
        data: createRouteData(),
      });

      map.addSource('seekPoint', {
        type: 'geojson',
        data: createPointData(),
      });

      map.addLayer({
        id: 'routeLine',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#888',
          'line-width': 8,
        },
      });

      map.addLayer({
        id: 'marker',
        type: 'circle',
        source: 'seekPoint',
        paint: {
          'circle-radius': 10,
          'circle-color': '#007cbf',
        },
      });

      lastPositionRef.current = null;
      applyDriveCoords(routeRef.current?.driveCoords);
      updateMarkerPos();
    });

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      element.removeEventListener('touchstart', stopTouchPropagation);
      element.removeEventListener('pointerdown', markInteraction, true);
      element.removeEventListener('wheel', markInteraction, true);
      map.remove();
      mapRef.current = null;
    };
  }, [applyDriveCoords]);

  useEffect(() => {
    routeRef.current = currentRoute;
  }, [currentRoute]);

  useEffect(() => {
    setPath([]);
    const route = routeRef.current;
    if (route) {
      dispatch(fetchDriveCoords(route));
    }
  }, [dispatch, routeFullname, setPath]);

  useEffect(() => {
    if (prevStartTimeRef.current && prevStartTimeRef.current !== startTime) {
      shouldAnimateRef.current = true;
    }
    prevStartTimeRef.current = startTime;
  }, [startTime]);

  useEffect(() => {
    applyDriveCoords(driveCoords);
  }, [driveCoords, applyDriveCoords]);

  return (
    <div ref={containerRef} className="h-full min-h-[300px] w-full cursor-default" />
  );
};

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  startTime: state.startTime,
});

export default connect(stateToProps)(DriveMap);
