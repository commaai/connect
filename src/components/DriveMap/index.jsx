import { useCallback, useEffect, useRef } from 'react';
import { connect } from 'react-redux';
import mapboxgl from 'mapbox-gl';

import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

mapboxgl.accessToken = MAPBOX_TOKEN;

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

const DriveMap = ({ dispatch, currentRoute, startTime }) => {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const shouldAnimateRef = useRef(false);
  const isInteractingRef = useRef(false);
  const interactionTimeoutRef = useRef(null);
  const lastPositionRef = useRef([0, 0]);
  const frameIdRef = useRef(null);
  const coordRangeRef = useRef({ min: null, max: null });

  const routeRef = useRef(currentRoute);
  const prevStartTimeRef = useRef(startTime);
  // update the ref with the newest route.
  routeRef.current = currentRoute;

  const routeFullname = currentRoute?.fullname || null;
  const driveCoords = currentRoute?.driveCoords;

  function moveViewportTo(pos) {
    if (!mapRef.current) return;

    if (shouldAnimateRef.current) {
      // LinearInterpolation
      mapRef.current.easeTo({
        center: pos,
        duration: 200,
        easing: (t) => t,
      });
      shouldAnimateRef.current = false;
    } else {
      mapRef.current.jumpTo({ center: pos });
    }
  }

  function updateMarkerPos() {
    const markerSource = mapRef.current?.getSource('seekPoint');
    if (markerSource) {
      const route = routeRef.current;
      if (route?.driveCoords) {
        const pos = posAtOffset(currentOffset(), route.driveCoords);
        if (pos && pos.some((coordinate, index) => coordinate !== lastPositionRef.current[index])) {
          lastPositionRef.current = pos;
          markerSource.setData(createPointData(pos));
          if (!isInteractingRef.current) {
            moveViewportTo(pos);
          }
        }
      } else if (markerSource._data && markerSource._data.coordinates.length > 0) {
        markerSource.setData(createPointData());
      }
    }

    frameIdRef.current = requestAnimationFrame(updateMarkerPos);
  }

  function posAtOffset(offset, coords) {
    const { min: driveCoordsMin, max: driveCoordsMax } = coordRangeRef.current;

    const offsetSeconds = Math.floor(offset / 1e3);
    const offsetFractionalPart = (offset % 1e3) / 1000.0;
    const coordIdx = Math.max(driveCoordsMin, Math.min(
      offsetSeconds,
      driveCoordsMax,
    ));
    const nextCoordIdx = Math.max(driveCoordsMin, Math.min(
      offsetSeconds + 1,
      driveCoordsMax,
    ));

    if (!coords[coordIdx]) {
      return null;
    }

    const [floorLng, floorLat] = coords[coordIdx];
    if (!coords[nextCoordIdx]) {
      return [floorLng, floorLat];
    }

    const [ceilLng, ceilLat] = coords[nextCoordIdx];
    return [
      floorLng + ((ceilLng - floorLng) * offsetFractionalPart),
      floorLat + ((ceilLat - floorLat) * offsetFractionalPart),
    ];
  }

  const setPath = useCallback((coords) => {
    mapRef.current?.getSource('route')?.setData(createRouteData(coords));
  }, []);

  const applyDriveCoords = useCallback((coords) => {
    if (!coords || !mapRef.current) {
      return;
    }

    shouldAnimateRef.current = false;
    const keys = Object.keys(coords);
    coordRangeRef.current = {
      min: Math.min(...keys),
      max: Math.max(...keys),
    };
    setPath(Object.values(coords));
  }, [setPath]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const stopTouchPropagation = (ev) => ev.stopPropagation();
    el.addEventListener('touchstart', stopTouchPropagation);

    const mapInstance = new mapboxgl.Map({
      container: el,
      style: MAPBOX_STYLE,
      center: [DEFAULT_LOCATION.longitude, DEFAULT_LOCATION.latitude],
      zoom: 14,
      pitch: 0,
      maxPitch: 0,
      attributionControl: false,
      dragRotate: false,
    });
    mapRef.current = mapInstance;

    const onMoveStart = (e) => {
      if (!e.originalEvent) return;
      shouldAnimateRef.current = true;
      isInteractingRef.current = true;
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = setTimeout(() => {
        isInteractingRef.current = false;
      }, INTERACTION_TIMEOUT);
    };
    mapInstance.on('movestart', onMoveStart);

    mapInstance.once('load', () => {
      if (!mapRef.current) return;

      mapInstance.addSource('route', {
        type: 'geojson',
        data: createRouteData(),
      });

      mapInstance.addSource('seekPoint', {
        type: 'geojson',
        data: createPointData(),
      });

      mapInstance.addLayer({
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

      mapInstance.addLayer({
        id: 'marker',
        type: 'circle',
        source: 'seekPoint',
        paint: {
          'circle-radius': 10,
          'circle-color': '#007cbf',
        },
      });

      applyDriveCoords(routeRef.current?.driveCoords);
    });

    updateMarkerPos();

    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
      clearTimeout(interactionTimeoutRef.current);

      el.removeEventListener('touchstart', stopTouchPropagation);
      mapInstance.off('movestart', onMoveStart);
      mapInstance.remove();
      mapRef.current = null;
    };
  }, [applyDriveCoords]);

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
    <div ref={containerRef} className="w-full h-full min-h-[300px] cursor-default" />
  );
};

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  startTime: state.startTime,
});

export default connect(stateToProps)(DriveMap);
