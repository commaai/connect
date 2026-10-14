import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, Typography } from '@material-ui/core';
import ReactMapGL, { LinearInterpolator } from 'react-map-gl';
import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset } from '../../timeline';
import useAnimationFrame, { useLatest } from '../../hooks/useAnimationFrame';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

const routeFeature = (coordinates) => ({
  type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates },
});

function DriveMap(props) {
  const { currentRoute, seekGeneration, dispatch } = props;
  const coords = currentRoute?.driveCoords;
  const bounds = useMemo(() => {
    const keys = Object.keys(coords || {});
    return [Math.min(...keys), Math.max(...keys)];
  }, [coords]);
  const latest = useLatest({ props, coords, bounds });
  const container = useRef(null);
  const mapRef = useRef(null);
  const interaction = useRef({ active: false, fly: false, timer: null, last: [0, 0] });
  const [viewport, setViewport] = useState({ ...DEFAULT_LOCATION, zoom: 14 });
  const setPath = useCallback((points) => {
    mapRef.current?.getMap().getSource('route')?.setData(routeFeature(points));
  }, []);

  useEffect(() => {
    setPath([]);
    const route = latest.current.props.currentRoute;
    if (route) dispatch(fetchDriveCoords(route));
  }, [currentRoute?.fullname, dispatch, latest, setPath]);
  useEffect(() => { interaction.current.fly = true; }, [seekGeneration]);
  useEffect(() => {
    if (!coords) return;
    interaction.current.fly = false;
    setPath(Object.values(coords));
  }, [coords, setPath]);
  useEffect(() => {
    const element = container.current;
    const stopTouch = (event) => event.stopPropagation();
    element.addEventListener('touchstart', stopTouch);
    return () => {
      element.removeEventListener('touchstart', stopTouch);
      clearTimeout(interaction.current.timer);
    };
  }, []);

  useAnimationFrame(() => {
    const source = mapRef.current?.getMap().getSource('seekPoint');
    if (!source) return;
    const { props: state, coords: points, bounds: [min, max] } = latest.current;
    if (!points) {
      if (source._data?.coordinates.length) source.setData({ type: 'Point', coordinates: [] });
      return;
    }
    const offset = currentOffset(state);
    const seconds = Math.floor(offset / 1000);
    const at = (second) => points[Math.max(min, Math.min(max, second))];
    const start = at(seconds);
    if (!start) return;
    const end = at(seconds + 1) || start;
    const fraction = offset % 1000 / 1000;
    const position = start.map((coordinate, index) => coordinate + (end[index] - coordinate) * fraction);
    const motion = interaction.current;
    if (!position.some((coordinate, index) => coordinate !== motion.last[index])) return;
    motion.last = position;
    source.setData({ type: 'Point', coordinates: position });
    if (!motion.active) {
      const transition = motion.fly ? { transitionDuration: 200, transitionInterpolator: new LinearInterpolator() } : {};
      motion.fly = false;
      setViewport((previous) => ({ ...previous, longitude: position[0], latitude: position[1], ...transition }));
    }
  });

  const initMap = useCallback((component) => {
    if (!component) { mapRef.current = null; return; }
    const map = component.getMap();
    if (!map) return;
    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: routeFeature([]) });
      map.addSource('seekPoint', { type: 'geojson', data: { type: 'Point', coordinates: [] } });
      map.addLayer({ id: 'routeLine', type: 'line', source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#888', 'line-width': 8 } });
      map.addLayer({ id: 'marker', type: 'circle', source: 'seekPoint',
        paint: { 'circle-radius': 10, 'circle-color': '#007cbf' } });
      mapRef.current = component;
      if (latest.current.coords) {
        interaction.current.fly = false;
        setPath(Object.values(latest.current.coords));
      }
    });
  }, [latest, setPath]);
  const onInteraction = ({ isDragging, isRotating, isZooming }) => {
    if (!isDragging && !isRotating && !isZooming) return;
    const motion = interaction.current;
    motion.fly = true;
    motion.active = true;
    clearTimeout(motion.timer);
    motion.timer = setTimeout(() => { motion.active = false; }, 5000);
  };

  return (
    <div>
      {currentRoute && (!coords || !Object.keys(coords).length || currentRoute.driveCoordsError) && (
        <Typography role="status">
          {currentRoute.driveCoordsError ? 'Some map data could not be loaded.' : coords ? 'No GPS data is available for this drive.' : 'Loading map data…'}
          {currentRoute.driveCoordsError && <Button onClick={() => dispatch(fetchDriveCoords(currentRoute))}>Retry map</Button>}
        </Typography>
      )}
      <div ref={container} className="h-full cursor-default [&_div]:h-full [&_div]:w-full [&_div]:min-h-[300px]">
        <ReactMapGL width="100%" height="100%" latitude={viewport.latitude} longitude={viewport.longitude} zoom={viewport.zoom}
          mapStyle={MAPBOX_STYLE} maxPitch={0} mapboxApiAccessToken={MAPBOX_TOKEN} ref={initMap}
          onContextMenu={null} dragRotate={false} onViewportChange={setViewport} attributionControl={false}
          onInteractionStateChange={onInteraction} />
      </div>
    </div>
  );
}

const stateToProps = (state) => ({
  offset: state.offset, currentRoute: state.currentRoute, seekGeneration: state.seekGeneration,
});
export default connect(stateToProps)(DriveMap);
