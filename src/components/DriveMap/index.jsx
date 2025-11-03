import { useEffect, useRef, useState } from 'react';
import ReactMapGL, { LinearInterpolator } from 'react-map-gl';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDriveCoords } from '../../actions/cached';
import { selectCurrentRoute } from '../../selectors/route';
import { currentOffset } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

const INTERACTION_TIMEOUT = 5000;

const DriveMap = () => {
  const dispatch = useDispatch();
  const currentRoute = useSelector((state) => selectCurrentRoute(state));
  const startTime = useSelector((state) => state.startTime);

  const [viewport, setViewport] = useState({
    ...DEFAULT_LOCATION,
    zoom: 14,
  });
  const [driveCoordsMin, setDriveCoordsMin] = useState(null);
  const [driveCoordsMax, setDriveCoordsMax] = useState(null);

  const mapRef = useRef(null);
  const mapInitializedRef = useRef(false); // Track if map.on('load') has been set up
  const mapLoadedRef = useRef(false); // Track if map has fully loaded
  const shouldFlyToRef = useRef(false);
  const isInteractingRef = useRef(false);
  const isInteractingTimeoutRef = useRef(null);
  const lastMapPosRef = useRef([0, 0]);
  const animationFrameId = useRef(null);
  const currentRouteRef = useRef(currentRoute);
  const driveCoordsMinRef = useRef(driveCoordsMin);
  const driveCoordsMaxRef = useRef(driveCoordsMax);

  // Keep refs in sync with state
  useEffect(() => {
    currentRouteRef.current = currentRoute;
    driveCoordsMinRef.current = driveCoordsMin;
    driveCoordsMaxRef.current = driveCoordsMax;
  }, [currentRoute, driveCoordsMin, driveCoordsMax]);

  const posAtOffset = (offset, route, minCoord, maxCoord) => {
    if (!route?.driveCoords) {
      return null;
    }

    const offsetSeconds = Math.floor(offset / 1e3);
    const offsetFractionalPart = (offset % 1e3) / 1000.0;
    const coordIdx = Math.max(minCoord, Math.min(offsetSeconds, maxCoord));
    const nextCoordIdx = Math.max(minCoord, Math.min(offsetSeconds + 1, maxCoord));

    if (!route.driveCoords[coordIdx]) {
      return null;
    }

    const [floorLng, floorLat] = route.driveCoords[coordIdx];
    if (!route.driveCoords[nextCoordIdx]) {
      return [floorLng, floorLat];
    }

    const [ceilLng, ceilLat] = route.driveCoords[nextCoordIdx];
    return [floorLng + (ceilLng - floorLng) * offsetFractionalPart, floorLat + (ceilLat - floorLat) * offsetFractionalPart];
  };

  const setPath = (coords) => {
    const map = mapRef.current && mapRef.current.getMap();

    if (map) {
      const source = map.getSource('route');
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        });
      }
    }
  };

  const populateMap = (route) => {
    if (!mapRef.current || !mapLoadedRef.current || !route || !route.driveCoords) {
      return;
    }

    setPath(Object.values(route.driveCoords));
  };

  const moveViewportTo = (pos) => {
    const newViewport = {
      longitude: pos[0],
      latitude: pos[1],
    };
    if (shouldFlyToRef.current) {
      newViewport.transitionDuration = 200;
      newViewport.transitionInterpolator = new LinearInterpolator();
      shouldFlyToRef.current = false;
    }

    setViewport((prevState) => ({
      ...prevState,
      ...newViewport,
    }));
  };

  const updateMarkerPos = () => {
    const markerSource = mapRef.current && mapRef.current.getMap().getSource('seekPoint');
    if (markerSource) {
      const route = currentRouteRef.current;
      if (route && route.driveCoords) {
        const pos = posAtOffset(currentOffset(), route, driveCoordsMinRef.current, driveCoordsMaxRef.current);
        if (pos && pos.some((coordinate, index) => coordinate !== lastMapPosRef.current[index])) {
          lastMapPosRef.current = pos;
          markerSource.setData({
            type: 'Point',
            coordinates: pos,
          });
          if (!isInteractingRef.current) {
            moveViewportTo(pos);
          }
        }
      } else if (markerSource._data && markerSource._data.coordinates.length > 0) {
        markerSource.setData({
          type: 'Point',
          coordinates: [],
        });
      }
    }

    animationFrameId.current = requestAnimationFrame(updateMarkerPos);
  };

  const onInteraction = (ev) => {
    if (ev.isDragging || ev.isRotating || ev.isZooming) {
      shouldFlyToRef.current = true;
      isInteractingRef.current = true;

      if (isInteractingTimeoutRef.current !== null) {
        clearTimeout(isInteractingTimeoutRef.current);
      }
      isInteractingTimeoutRef.current = setTimeout(() => {
        isInteractingRef.current = false;
      }, INTERACTION_TIMEOUT);
    }
  };

  const onRef = (el) => {
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  };

  const onViewportChange = (newViewport) => {
    setViewport(newViewport);
  };

  const initMap = (mapComponent) => {
    if (!mapComponent) {
      mapRef.current = null;
      return;
    }

    const map = mapComponent.getMap();
    if (!map) {
      mapRef.current = null;
      return;
    }

    // Prevent setting up the event handler multiple times
    if (mapInitializedRef.current) {
      return;
    }
    mapInitializedRef.current = true;

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        },
      });
      map.addSource('seekPoint', {
        type: 'geojson',
        data: {
          type: 'Point',
          coordinates: [],
        },
      });

      const lineGeoJson = {
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
      };
      map.addLayer(lineGeoJson);

      const markerGeoJson = {
        id: 'marker',
        type: 'circle',
        paint: {
          'circle-radius': 10,
          'circle-color': '#007cbf',
        },
        source: 'seekPoint',
      };

      map.addLayer(markerGeoJson);

      mapRef.current = mapComponent;
      mapLoadedRef.current = true; // Mark map as loaded

      // Use ref to get current value, not closure
      const route = currentRouteRef.current;
      if (route?.driveCoords) {
        shouldFlyToRef.current = false;
        const keys = Object.keys(route.driveCoords);
        setDriveCoordsMin(Math.min(...keys));
        setDriveCoordsMax(Math.max(...keys));
        populateMap(route);
      }
    });
  };

  // Initialize on mount - fetch coords and start animation
  // biome-ignore lint/correctness/useExhaustiveDependencies: updateMarkerPos intentionally not in deps to avoid infinite RAF loop
  useEffect(() => {
    const route = currentRoute?.fullname || null;
    if (route) {
      dispatch(fetchDriveCoords(currentRoute));
    }

    animationFrameId.current = requestAnimationFrame(updateMarkerPos);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [currentRoute, dispatch]);

  // Handle route changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: setPath intentionally not in deps to avoid re-running on every render
  useEffect(() => {
    const route = currentRoute?.fullname || null;
    if (route) {
      dispatch(fetchDriveCoords(currentRoute));
    } else {
      setPath([]);
    }
  }, [currentRoute?.fullname, dispatch, currentRoute]);

  // Handle startTime changes
  useEffect(() => {
    if (startTime) {
      shouldFlyToRef.current = true;
    }
  }, [startTime]);

  // Handle driveCoords updates
  // biome-ignore lint/correctness/useExhaustiveDependencies: populateMap intentionally not in deps to avoid re-running on every render
  useEffect(() => {
    if (currentRoute?.driveCoords) {
      shouldFlyToRef.current = false;
      const keys = Object.keys(currentRoute.driveCoords);
      setDriveCoordsMin(Math.min(...keys));
      setDriveCoordsMax(Math.max(...keys));
      populateMap(currentRoute);
    }
  }, [currentRoute?.driveCoords, currentRoute]);

  return (
    <div ref={onRef} className="h-full cursor-default [&_div]:h-full [&_div]:w-full [&_div]:min-h-[300px]">
      <ReactMapGL
        width="100%"
        height="100%"
        latitude={viewport.latitude}
        longitude={viewport.longitude}
        zoom={viewport.zoom}
        mapStyle={MAPBOX_STYLE}
        maxPitch={0}
        mapboxApiAccessToken={MAPBOX_TOKEN}
        ref={initMap}
        onContextMenu={null}
        dragRotate={false}
        onViewportChange={onViewportChange}
        attributionControl={false}
        onInteractionStateChange={onInteraction}
      />
    </div>
  );
};

export default DriveMap;
