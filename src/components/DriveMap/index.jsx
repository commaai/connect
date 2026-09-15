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
  const map = useRef(null);
  const container = useRef(null);
  const shouldFlyTo = useRef(false);
  const isInteracting = useRef(false);
  const isInteractingTimeout = useRef(null);
  const lastMapPos = useRef([0, 0]);
  const animationFrame = useRef(null);
  const driveCoordsRange = useRef({ min: null, max: null });

  const currentRouteRef = useRef(currentRoute);
  const prevStartTime = useRef(startTime);
  // update the ref with the newest route.
  currentRouteRef.current = currentRoute;

  const routeFullname = currentRoute?.fullname || null;
  const driveCoords = currentRoute?.driveCoords;

  function moveViewportTo(pos) {
    if (!map.current) return;

    if (shouldFlyTo.current) {
      // LinearInterpolation
      map.current.easeTo({
        center: pos,
        duration: 200,
        easing: (t) => t,
      });
      shouldFlyTo.current = false;
    } else {
      map.current.jumpTo({ center: pos });
    }
  }

  function updateMarkerPos() {
    const markerSource = map.current?.getSource('seekPoint');
    if (markerSource) {
      const route = currentRouteRef.current;
      if (route?.driveCoords) {
        const pos = posAtOffset(currentOffset(), route.driveCoords);
        if (pos && pos.some((coordinate, index) => coordinate !== lastMapPos.current[index])) {
          lastMapPos.current = pos;
          markerSource.setData(createPointData(pos));
          if (!isInteracting.current) {
            moveViewportTo(pos);
          }
        }
      } else if (markerSource._data && markerSource._data.coordinates.length > 0) {
        markerSource.setData(createPointData());
      }
    }

    animationFrame.current = requestAnimationFrame(updateMarkerPos);
  }

  function posAtOffset(offset, coords) {
    const { min: driveCoordsMin, max: driveCoordsMax } = driveCoordsRange.current;

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
    const source = map.current?.getSource('route');
    if (!source) return;

    source.setData(createRouteData(coords));
  }, []);

  const applyDriveCoords = useCallback((coords) => {
    if (!coords || !map.current) {
      return;
    }

    shouldFlyTo.current = false;
    const keys = Object.keys(coords);
    driveCoordsRange.current = {
      min: Math.min(...keys),
      max: Math.max(...keys),
    };
    setPath(Object.values(coords));
  }, [setPath]);

  useEffect(() => {
    const el = container.current;
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
    map.current = mapInstance;

    const onMoveStart = (e) => {
      if (!e.originalEvent) return;
      shouldFlyTo.current = true;
      isInteracting.current = true;
      clearTimeout(isInteractingTimeout.current);
      isInteractingTimeout.current = setTimeout(() => {
        isInteracting.current = false;
        isInteractingTimeout.current = null;
      }, INTERACTION_TIMEOUT);
    };
    mapInstance.on('movestart', onMoveStart);

    mapInstance.once('load', () => {
      if (!map.current) return;

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

      applyDriveCoords(currentRouteRef.current?.driveCoords);
    });

    updateMarkerPos();

    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
      clearTimeout(isInteractingTimeout.current);
      isInteractingTimeout.current = null;

      el.removeEventListener('touchstart', stopTouchPropagation);
      mapInstance.off('movestart', onMoveStart);
      mapInstance.remove();
      map.current = null;
    };
  }, [applyDriveCoords]);

  useEffect(() => {
    setPath([]);
    const route = currentRouteRef.current;
    if (route) {
      dispatch(fetchDriveCoords(route));
    }
  }, [dispatch, routeFullname, setPath]);

  useEffect(() => {
    if (prevStartTime.current && prevStartTime.current !== startTime) {
      shouldFlyTo.current = true;
    }
    prevStartTime.current = startTime;
  }, [startTime]);

  useEffect(() => {
    applyDriveCoords(driveCoords);
  }, [driveCoords, applyDriveCoords]);

  return (
    <div ref={container} className="w-full h-full cursor-default" />
  );
};

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  startTime: state.startTime,
});

export default connect(stateToProps)(DriveMap);
