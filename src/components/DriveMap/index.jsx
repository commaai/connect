import { useCallback, useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';

import ReactMapGL, { LinearInterpolator } from 'react-map-gl';

import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

const INTERACTION_TIMEOUT = 5000;

const DriveMap = (props) => {
  const [viewport, setViewport] = useState({
    ...DEFAULT_LOCATION,
    zoom: 14,
  });

  const map = useRef(null);
  const container = useRef(null);
  const shouldFlyTo = useRef(false);
  const isInteracting = useRef(false);
  const isInteractingTimeout = useRef(null);
  const lastMapPos = useRef([0, 0]);
  const animationFrame = useRef(null);
  const mapLoadListener = useRef(null);
  const driveCoordsRange = useRef({ min: null, max: null });

  const propsRef = useRef(props);
  const prevStartTime = useRef(props.startTime);

  propsRef.current = props;

  const routeFullname = props.currentRoute?.fullname || null;
  const driveCoords = props.currentRoute?.driveCoords;

  const onInteraction = useCallback((ev) => {
    if (ev.isDragging || ev.isRotating || ev.isZooming) {
      shouldFlyTo.current = true;
      isInteracting.current = true;

      if (isInteractingTimeout.current !== null) {
        clearTimeout(isInteractingTimeout.current);
      }
      isInteractingTimeout.current = setTimeout(() => {
        isInteracting.current = false;
        isInteractingTimeout.current = null;
      }, INTERACTION_TIMEOUT);
    }
  }, []);

  function updateMarkerPos() {
    const markerSource = map.current && map.current.getMap().getSource('seekPoint');
    if (markerSource) {
      const { currentRoute } = propsRef.current;
      if (currentRoute && currentRoute.driveCoords) {
        const pos = posAtOffset(currentOffset());
        if (pos && pos.some((coordinate, index) => coordinate !== lastMapPos.current[index])) {
          lastMapPos.current = pos;
          markerSource.setData({
            type: 'Point',
            coordinates: pos,
          });
          if (!isInteracting.current) {
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

    animationFrame.current = requestAnimationFrame(updateMarkerPos);
  }

  function moveViewportTo(pos) {
    const nextViewport = {
      longitude: pos[0],
      latitude: pos[1],
    };
    if (shouldFlyTo.current) {
      nextViewport.transitionDuration = 200;
      nextViewport.transitionInterpolator = new LinearInterpolator();
      shouldFlyTo.current = false;
    }

    setViewport((prevViewport) => ({
      ...prevViewport,
      ...nextViewport,
    }));
  }

  const setPath = useCallback((coords) => {
    const mapInstance = map.current && map.current.getMap();

    if (mapInstance) {
      mapInstance.getSource('route').setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      });
    }
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

  const onViewportChange = useCallback((nextViewport) => {
    setViewport(nextViewport);
  }, []);

  function posAtOffset(offset) {
    const { currentRoute } = propsRef.current;
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

    if (!currentRoute.driveCoords[coordIdx]) {
      return null;
    }

    const [floorLng, floorLat] = currentRoute.driveCoords[coordIdx];
    if (!currentRoute.driveCoords[nextCoordIdx]) {
      return [floorLng, floorLat];
    }

    const [ceilLng, ceilLat] = currentRoute.driveCoords[nextCoordIdx];
    return [
      floorLng + ((ceilLng - floorLng) * offsetFractionalPart),
      floorLat + ((ceilLat - floorLat) * offsetFractionalPart),
    ];
  }

  const initMap = useCallback((mapComponent) => {
    if (mapLoadListener.current) {
      mapLoadListener.current.mapInstance.off('load', mapLoadListener.current.handler);
      mapLoadListener.current = null;
    }

    if (!mapComponent) {
      map.current = null;
      return;
    }

    const mapInstance = mapComponent.getMap();
    if (!mapInstance) {
      map.current = null;
      return;
    }

    const handleLoad = () => {
      mapInstance.off('load', handleLoad);
      mapLoadListener.current = null;

      mapInstance.addSource('route', {
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
      mapInstance.addSource('seekPoint', {
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
      mapInstance.addLayer(lineGeoJson);

      const markerGeoJson = {
        id: 'marker',
        type: 'circle',
        paint: {
          'circle-radius': 10,
          'circle-color': '#007cbf',
        },
        source: 'seekPoint',
      };

      mapInstance.addLayer(markerGeoJson);

      map.current = mapComponent;
      applyDriveCoords(propsRef.current.currentRoute?.driveCoords);
    };

    mapLoadListener.current = {
      mapInstance,
      handler: handleLoad,
    };
    mapInstance.on('load', handleLoad);
  }, [applyDriveCoords]);

  useEffect(() => {
    setPath([]);
    const { dispatch, currentRoute } = propsRef.current;
    if (currentRoute) {
      dispatch(fetchDriveCoords(currentRoute));
    }
  }, [routeFullname, setPath]);

  useEffect(() => {
    if (prevStartTime.current && prevStartTime.current !== props.startTime) {
      shouldFlyTo.current = true;
    }
    prevStartTime.current = props.startTime;
  }, [props.startTime]);

  useEffect(() => {
    applyDriveCoords(driveCoords);
  }, [driveCoords, applyDriveCoords]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const stopTouchPropagation = (ev) => ev.stopPropagation();
    el.addEventListener('touchstart', stopTouchPropagation);
    return () => {
      el.removeEventListener('touchstart', stopTouchPropagation);
    }
  }, []);

  useEffect(() => {
    updateMarkerPos();

    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
      if (isInteractingTimeout.current !== null) {
        clearTimeout(isInteractingTimeout.current);
        isInteractingTimeout.current = null;
      }
    };
  }, []);

  return (
    <div ref={container} className="h-full cursor-default [&_div]:h-full [&_div]:w-full [&_div]:min-h-[300px]">
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

const stateToProps = (state) => ({
  offset: state.offset,
  currentRoute: state.currentRoute,
  startTime: state.startTime,
});

export default connect(stateToProps)(DriveMap);
