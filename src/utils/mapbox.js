import mapboxgl from 'mapbox-gl';

import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from './geocode';

mapboxgl.accessToken = MAPBOX_TOKEN;

export const createMap = (container, options = {}) => new mapboxgl.Map({
  style: MAPBOX_STYLE,
  center: [DEFAULT_LOCATION.longitude, DEFAULT_LOCATION.latitude],
  maxPitch: 0,
  attributionControl: false,
  dragRotate: false,
  ...options,
  container,
});

export default mapboxgl;
