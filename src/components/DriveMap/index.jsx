import React, { useCallback, useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import Map from 'react-map-gl';

import { MAPBOX_TOKEN } from '../../utils/geocode';
import { currentOffset } from '../../timeline';
import { fetchDriveCoords } from '../../actions/cached';

const MAP_STYLE = 'mapbox://styles/commaai/cjj4yzqk201c52ss60ebmow0w';
// const INTERACTION_TIMEOUT = 5000;

const useAnimationFrame = (handler) => {
  const frame = useRef(0);

  const animate = useCallback(() => {
    handler();
    frame.current = requestAnimationFrame(animate);
  }, [handler]);

  useEffect(() => {
    frame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame.current);
  }, [animate]);
};

const DriveMap = ({ currentRoute, dispatch/* , startTime */ }) => {
  const [viewState, setViewState] = useState({
    latitude: 37.7577,
    longitude: -122.4376,
    zoom: 15,
  });
  const [driveCoordsRange, setDriveCoordsRange] = useState(null);

  // const [shouldFlyTo, setShouldFlyTo] = useState(false);
  // const [interacting, setInteracting] = useState(false);
  // const interactingTimeout = useRef(null);

  // const containerRef = useRef();
  const mapRef = useRef();
  const innerMapRef = useRef();

  const posAtOffset = useCallback((offset) => {
    if (!currentRoute?.driveCoords) {
      return null;
    }

    const [driveCoordsMin, driveCoordsMax] = driveCoordsRange;
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
  }, [currentRoute, driveCoordsRange]);

  const moveViewStateTo = useCallback((pos) => {
    const newViewState = {
      longitude: pos[0],
      latitude: pos[1],
    };
    // if (shouldFlyTo) {
    //   mapRef.current?.flyTo({
    //     center: [newViewState.longitude, newViewState.latitude],
    //     maxDuration: 200,
    //   });
    //   setShouldFlyTo(false);
    // }

    setViewState((prevState) => ({
      ...prevState,
      ...newViewState,
    }));
  }, []);  // , [shouldFlyTo]);

  const updatePath = useCallback((coords) => {
    const mapRoute = innerMapRef.current?.getSource('route');
    if (!mapRoute) return;

    mapRoute.setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    });
  }, [innerMapRef]);

  // populate map
  useEffect(() => {
    if (!currentRoute) {
      updatePath([]);
      return;
    }

    dispatch(fetchDriveCoords(currentRoute));
    const driveCoords = currentRoute?.driveCoords || {};
    if (!driveCoords || Object.keys(driveCoords).length === 0) {
      setDriveCoordsRange(null);
      updatePath([]);
      return;
    }

    const keys = Object.keys(driveCoords);
    setDriveCoordsRange([Math.min(...keys), Math.max(...keys)]);
    // setShouldFlyTo(false);
    updatePath(Object.values(driveCoords));
  }, [currentRoute, dispatch, updatePath]);

  const updateMarkerPos = useCallback((map) => {
    const markerSource = map.getSource('seekPoint');
    if (!markerSource) return;

    if (currentRoute?.driveCoords) {
      const { offset } = currentRoute;
      const pos = posAtOffset(currentOffset() - offset);
      if (pos) {
        markerSource.setData({
          type: 'Point',
          coordinates: pos,
        });
        // if (!interacting) {
        moveViewStateTo(pos);
        // }
      }
    } else if (markerSource._data && markerSource._data.coordinates.length > 0) {
      markerSource.setData({
        type: 'Point',
        coordinates: [],
      });
    }
  }, [currentRoute, /* interacting, */ moveViewStateTo, posAtOffset]);

  // update marker position every frame
  useAnimationFrame(() => {
    const map = innerMapRef.current;
    if (!map) {
      return;
    }

    updateMarkerPos(map);
  });

  // fly to new map position when seeking
  // useEffect(() => {
  //   setShouldFlyTo(true);
  // }, [startTime]);

  // TODO: what is this for?
  // useEffect(() => {
  //   const el = containerRef.current;
  //   const listener = (ev) => ev.stopPropagation();
  //   el?.addEventListener('touchstart', listener);
  //   return () => el?.removeEventListener('touchstart', listener);
  // }, [containerRef]);

  const onLoad = useCallback((evt) => {
    const map = evt.target;

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

    innerMapRef.current = map;
  }, []);

  // const onInteraction = useCallback((ev) => {
  //   if (ev.isDragging || ev.isRotating || ev.isZooming) {
  //     setShouldFlyTo(true);
  //     setInteracting(true);

  //     if (interactingTimeout.current !== null) {
  //       clearTimeout(interactingTimeout.current);
  //     }
  //     interactingTimeout.current = setTimeout(() => {
  //       setInteracting(false);
  //     }, INTERACTION_TIMEOUT);
  //   }
  // }, []);

  return (
    <div
      // ref={containerRef}
      className="h-full cursor-default w-full min-h-[300px]"
    >
      <Map
        latitude={viewState.latitude}
        longitude={viewState.longitude}
        zoom={viewState.zoom}
        ref={mapRef}
        width="100%"
        height="100%"
        mapStyle={MAP_STYLE}
        maxPitch={0}
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={onLoad}
        onMove={(event) => setViewState(event.viewState)}
        // onContextMenu={null}
        dragRotate={false}
        touchPitch={false}
        // touchZoomRotate={false}
        attributionControl={false}
        // onInteractionStateChange={onInteraction}
      />
    </div>
  );
};

const stateToProps = Obstruction({
  currentRoute: 'currentRoute',
  startTime: 'startTime',
});

export default connect(stateToProps)(DriveMap);
