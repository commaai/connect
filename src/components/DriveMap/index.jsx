import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress } from '@material-ui/core';

import mapboxgl from 'mapbox-gl';

import { pushTimelineRange, seek } from '../../actions';
import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset, seek as seekVideo } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

const INTERACTION_TIMEOUT = 5000;

// the zoom of a map following the car
const ZOOM = 14;
// room around the whole drive in the small map in a corner, in pixels
const FIT_PADDING = 12;

const SEGMENT_DURATION = 60 * 1000;
// how close to the marker a press grabs it, in pixels
const MARKER_GRAB_RADIUS = 24;
// how close to the route a tap selects its segment, in pixels
const CLICK_RADIUS = 10;
const INTERACTIVE_LAYERS = ['routeLine', 'segmentLabels'];

// alternate shades tell segments apart, the one being played stands out
function routeLineColor(currentSegment) {
  return [
    'case',
    ['==', ['get', 'segment'], currentSegment], '#3d9be0',
    ['==', ['%', ['get', 'segment'], 2], 0], '#8a8a8a',
    '#5c656b',
  ];
}

// one line per segment, each joined to the start of the next
export function segmentLines(driveCoords) {
  const features = [];
  Object.entries(driveCoords).forEach(([second, coord]) => {
    const segment = Math.floor((second * 1000) / SEGMENT_DURATION);
    const last = features[features.length - 1];
    if (last?.properties.segment === segment) {
      last.geometry.coordinates.push(coord);
      return;
    }
    last?.geometry.coordinates.push(coord);
    features.push({
      type: 'Feature',
      properties: { segment },
      geometry: { type: 'LineString', coordinates: [coord] },
    });
  });
  return { type: 'FeatureCollection', features };
}

// one point per segment, halfway along it, to put its number on
export function segmentLabelPoints(lines) {
  return {
    type: 'FeatureCollection',
    features: lines.features.map(({ properties, geometry }) => ({
      type: 'Feature',
      properties,
      geometry: { type: 'Point', coordinates: geometry.coordinates[Math.floor(geometry.coordinates.length / 2)] },
    })),
  };
}

// the selected stretch of the drive, drawn as a halo under the route
function selectionLine(driveCoords, selection) {
  const coordinates = selection
    ? Object.entries(driveCoords)
      .filter(([second]) => second * 1000 >= selection.start && second * 1000 <= selection.end)
      .map(([, coord]) => coord)
    : [];
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
}

// the drive offset whose position is nearest to [lng, lat]
export function offsetNearest(driveCoords, [lng, lat]) {
  let nearest = null;
  let nearestDistance = Infinity;
  Object.entries(driveCoords).forEach(([second, [x, y]]) => {
    const distance = Math.hypot(x - lng, y - lat);
    if (distance < nearestDistance) {
      nearest = second * 1000;
      nearestDistance = distance;
    }
  });
  return nearest;
}

// Mapbox GL is driven directly rather than through React: the camera follows the
// marker every frame, which as React state would re-render 60 times a second, and
// the map's own touch handling is what makes it smooth on phones and tablets.
// the direction from one [lng, lat] to another, in degrees clockwise from north;
// null when they are the same place
export function headingBetween(from, to) {
  if (from[0] === to[0] && from[1] === to[1]) {
    return null;
  }
  const east = (to[0] - from[0]) * Math.cos((to[1] * Math.PI) / 180);
  const north = to[1] - from[1];
  return (Math.atan2(east, north) * 180) / Math.PI;
}

// the car marking where playback is, seen from above and facing north, in the style of
// Google Maps; drawn twice as big as shown so it stays sharp on high density screens
function carIcon() {
  const scale = 2;
  const width = 24;
  const height = 42;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const roundedRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const polygon = (points) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };

  // body, shaded across so it looks rounded, on a soft shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  roundedRect(4, 3, 16, 36, 7);
  const paint = ctx.createLinearGradient(4, 0, 20, 0);
  paint.addColorStop(0, '#b0bec5');
  paint.addColorStop(0.5, '#ffffff');
  paint.addColorStop(1, '#b0bec5');
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.stroke();

  // mirrors
  ctx.fillStyle = '#b0bec5';
  roundedRect(1.5, 13, 3, 2.5, 1);
  ctx.fill();
  roundedRect(19.5, 13, 3, 2.5, 1);
  ctx.fill();

  // windscreen, rear window and roof
  ctx.fillStyle = '#1b2733';
  polygon([[6.5, 12.5], [17.5, 12.5], [16, 18], [8, 18]]);
  ctx.fill();
  polygon([[8, 31], [16, 31], [17, 34.5], [7, 34.5]]);
  ctx.fill();
  roundedRect(8, 18.5, 8, 12, 2);
  ctx.fillStyle = '#eceff1';
  ctx.fill();

  // headlights and tail lights
  ctx.fillStyle = '#ffe082';
  roundedRect(6, 3.8, 3.5, 1.6, 0.8);
  ctx.fill();
  roundedRect(14.5, 3.8, 3.5, 1.6, 0.8);
  ctx.fill();
  ctx.fillStyle = '#e53935';
  roundedRect(6, 36.8, 3.5, 1.4, 0.7);
  ctx.fill();
  roundedRect(14.5, 36.8, 3.5, 1.4, 0.7);
  ctx.fill();

  return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio: scale };
}

class DriveMap extends Component {
  constructor(props) {
    super(props);

    this.state = {
      mapLoaded: false,
      driveCoordsMin: null,
      driveCoordsMax: null,
    };

    this.container = React.createRef();
    this.onRef = this.onRef.bind(this);
    this.onLoad = this.onLoad.bind(this);
    this.populateMap = this.populateMap.bind(this);
    this.posAtOffset = this.posAtOffset.bind(this);
    this.setPath = this.setPath.bind(this);
    this.updateMarkerPos = this.updateMarkerPos.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onClick = this.onClick.bind(this);

    this.map = null;
    this.mapReady = false;
    this.shouldFlyTo = false;
    this.isInteracting = false;
    this.isInteractingTimeout = null;
    this.pointerDown = false;
    this.panning = false;
    this.markerDragging = false;
    this.lastMapPos = [0, 0];
    this.heading = 0; // where the car faces, in degrees clockwise from north
    this.markerShown = false;
    this.lastOffset = null;
    this.currentSegment = null;
    this.dragOffset = null;
    this.followZoom = ZOOM; // kept while the map is small and shows the whole drive
  }

  componentDidMount() {
    this.mounted = true;

    const map = new mapboxgl.Map({
      container: this.container.current,
      style: MAPBOX_STYLE,
      accessToken: MAPBOX_TOKEN,
      center: [DEFAULT_LOCATION.longitude, DEFAULT_LOCATION.latitude],
      zoom: ZOOM,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    });
    map.on('load', this.onLoad);
    map.on('move', this.onMove);
    map.on('dragstart', () => {
      this.panning = true;
      this.updateCursor();
    });
    map.on('dragend', () => {
      this.panning = false;
      this.updateCursor();
    });
    map.on('mousedown', this.onPointerDown);
    map.on('touchstart', this.onPointerDown);
    map.on('mousemove', this.onPointerMove);
    map.on('touchmove', this.onPointerMove);
    map.on('touchend', this.onTouchEnd);
    map.on('touchcancel', this.onTouchEnd);
    map.on('click', this.onClick);
    // a mouse can be released outside the map
    window.addEventListener('mouseup', this.onPointerUp);
    this.map = map;

    // the map switches between filling the frame and a small window in its corner
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        map.resize();
        if (this.props.small) {
          this.fitDrive();
        }
      });
      this.resizeObserver.observe(this.container.current);
    }

    this.componentDidUpdate({}, {});
    this.updateMarkerPos();
  }

  componentDidUpdate(prevProps) {
    const { dispatch, currentRoute, zoom, small } = this.props;

    // small, the map zooms out to the whole drive; big again, it follows the car at the zoom it had
    if (this.mapReady && prevProps.small !== undefined && Boolean(small) !== Boolean(prevProps.small)) {
      this.map.resize();
      if (small) {
        this.followZoom = this.map.getZoom();
        this.fitDrive();
      } else {
        this.shouldFlyTo = false;
        this.map.jumpTo({ center: this.lastMapPos, zoom: this.followZoom });
      }
    }

    const prevRoute = prevProps.currentRoute?.fullname || null;
    const route = currentRoute?.fullname || null;
    if (prevRoute !== route) {
      this.setPath(segmentLines({}));
      if (route) {
        dispatch(fetchDriveCoords(currentRoute));
      }
    }

    if (zoom !== prevProps.zoom || this.props.selectionPreview !== prevProps.selectionPreview) {
      this.updateSelection();
    }

    if (currentRoute && prevProps.currentRoute && currentRoute.driveCoords
      && prevProps.currentRoute.driveCoords !== currentRoute.driveCoords) {
      this.shouldFlyTo = false;
      const keys = Object.keys(currentRoute.driveCoords);
      this.setState({
        driveCoordsMin: Math.min(...keys),
        driveCoordsMax: Math.max(...keys),
      });
      this.populateMap();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.isInteractingTimeout);
    window.removeEventListener('mouseup', this.onPointerUp);
    this.resizeObserver?.disconnect();
    this.map.remove();
    this.map = null;
    this.mapReady = false;
  }

  isOverMarker(point) {
    if (!this.mapReady || !this.props.currentRoute?.driveCoords) {
      return false;
    }
    const marker = this.map.project(this.lastMapPos);
    return Math.hypot(marker.x - point.x, marker.y - point.y) <= MARKER_GRAB_RADIUS;
  }

  // the route segments and their numbers around a point
  featuresAt(point) {
    if (!this.mapReady) {
      return [];
    }
    return this.map.queryRenderedFeatures([
      [point.x - CLICK_RADIUS, point.y - CLICK_RADIUS],
      [point.x + CLICK_RADIUS, point.y + CLICK_RADIUS],
    ], { layers: INTERACTIVE_LAYERS });
  }

  // a hand that grabs the marker, a pointing finger on a segment to select
  updateCursor(point) {
    let cursor = 'default';
    if (this.markerDragging || this.panning) {
      cursor = 'grabbing';
    } else if (point && this.isOverMarker(point)) {
      cursor = 'grab';
    } else if (point && this.featuresAt(point).length > 0) {
      cursor = 'pointer';
    }
    this.map.getCanvas().style.cursor = cursor;
  }

  // press on the marker to drag it along the route
  onPointerDown(ev) {
    this.pointerDown = true;
    if (this.markerDragging) {
      // no pinching while the marker is held
      ev.preventDefault();
      return;
    }
    if (ev.type === 'touchstart' && ev.points.length !== 1) {
      return;
    }
    if (this.isOverMarker(ev.point)) {
      // keep the map still while the marker moves
      ev.preventDefault();
      this.markerDragging = true;
      this.selectionReleased = false;
      this.dragOffset = currentOffset();
      this.updateCursor();
    }
  }

  onPointerMove(ev) {
    if (!this.markerDragging) {
      if (ev.type === 'mousemove' && !this.panning) {
        this.updateCursor(ev.point);
      }
      return;
    }
    this.dragOffset = offsetNearest(this.props.currentRoute.driveCoords, ev.lngLat.toArray());
    this.releaseSelectionOutside(this.dragOffset);
    seekVideo(this.dragOffset);
  }

  // dragging the marker out of the selection gives way to the whole drive, as on the timeline
  releaseSelectionOutside(offset) {
    const { currentRoute, zoom, dispatch } = this.props;
    const partial = zoom && (zoom.start > 0 || zoom.end < currentRoute.duration);
    if (!this.selectionReleased && partial && (offset < zoom.start || offset > zoom.end)) {
      this.selectionReleased = true;
      dispatch(pushTimelineRange(currentRoute.log_id, 0, currentRoute.duration, true));
    }
  }

  onTouchEnd(ev) {
    if (ev.originalEvent.touches.length === 0) {
      this.onPointerUp();
    }
  }

  onPointerUp() {
    this.pointerDown = false;
    if (!this.markerDragging) {
      return;
    }
    this.markerDragging = false;
    this.updateCursor();
    this.props.dispatch(seek(this.dragOffset));
  }

  // tap a segment of the route, or its number, to select the whole segment
  onClick(ev) {
    const { currentRoute, dispatch } = this.props;
    const segment = this.featuresAt(ev.point)[0]?.properties.segment;
    if (segment === undefined || !currentRoute || this.isOverMarker(ev.point)) {
      return;
    }
    const start = segment * SEGMENT_DURATION;
    const end = Math.min(start + SEGMENT_DURATION, currentRoute.duration);
    dispatch(pushTimelineRange(currentRoute.log_id, start, end, true));
  }

  // the user moved the map: stop following the marker for a while
  onMove(ev) {
    if (!ev.originalEvent) {
      return; // our own camera moves
    }
    this.shouldFlyTo = true;
    this.isInteracting = true;
    clearTimeout(this.isInteractingTimeout);
    this.isInteractingTimeout = setTimeout(() => {
      this.isInteracting = false;
    }, INTERACTION_TIMEOUT);
  }

  updateMarkerPos() {
    if (!this.mounted) {
      return;
    }

    if (!this.mapReady) {
      requestAnimationFrame(this.updateMarkerPos);
      return;
    }

    const markerSource = this.map.getSource('seekPoint');
    if (this.props.currentRoute && this.props.currentRoute.driveCoords) {
      const offset = currentOffset();
      // glide to the marker after a seek instead of snapping to it
      if (this.lastOffset !== null && Math.abs(offset - this.lastOffset) > 1000) {
        this.shouldFlyTo = true;
      }
      this.lastOffset = offset;
      const segment = Math.floor(offset / SEGMENT_DURATION);
      if (segment !== this.currentSegment) {
        this.currentSegment = segment;
        this.map.setPaintProperty('routeLine', 'line-color', routeLineColor(segment));
      }
      const pos = this.posAtOffset(offset);
      if (pos && this.movedOnScreen(pos)) {
        this.lastMapPos = pos;
        this.markerShown = true;
        markerSource.setData({
          type: 'Feature',
          properties: { heading: this.headingAt(offset) },
          geometry: { type: 'Point', coordinates: pos },
        });
        this.followMarker(pos);
      }
    } else if (this.markerShown) {
      this.markerShown = false;
      markerSource.setData({ type: 'FeatureCollection', features: [] });
    }

    requestAnimationFrame(this.updateMarkerPos);
  }

  // which way the car faces: along the road it drove over the second before and after,
  // keeping the last heading while it stands still
  headingAt(offset) {
    const from = this.posAtOffset(offset - 1000);
    const to = this.posAtOffset(offset + 1000);
    this.heading = (from && to && headingBetween(from, to)) ?? this.heading;
    return this.heading;
  }

  // the map redraws on every change: leave out moves smaller than a screen pixel
  movedOnScreen(pos) {
    const from = this.map.project(this.lastMapPos);
    const to = this.map.project(pos);
    return Math.hypot(to.x - from.x, to.y - from.y) * window.devicePixelRatio >= 1;
  }

  followMarker(pos) {
    // moving the camera cancels the gesture the user is starting
    if (this.isInteracting || this.pointerDown || this.markerDragging || this.map.isMoving()) {
      return;
    }
    if (this.shouldFlyTo) {
      this.shouldFlyTo = false;
      this.map.easeTo({ center: pos, duration: 200, easing: (t) => t });
    } else {
      this.map.jumpTo({ center: pos });
    }
  }

  async populateMap() {
    const { currentRoute } = this.props;

    if (!this.mapReady || !currentRoute || !currentRoute.driveCoords) {
      return;
    }

    this.setPath(segmentLines(currentRoute.driveCoords));
    this.updateSelection();
    if (this.props.small) {
      this.fitDrive();
    }
  }

  // for the small map in a corner: centred on the car, zoomed out so the whole drive stays in view
  fitDrive() {
    const points = Object.values(this.props.currentRoute?.driveCoords || {});
    if (!this.mapReady || points.length === 0) {
      return;
    }
    const bounds = points.reduce((b, point) => b.extend(point), new mapboxgl.LngLatBounds(points[0], points[0]));
    const camera = this.map.cameraForBounds(bounds, { padding: FIT_PADDING, maxZoom: ZOOM });
    if (!camera) {
      return;
    }
    // centred on the car, the drive can reach twice as far on one side: one zoom level further out
    this.map.jumpTo({ center: this.markerShown ? this.lastMapPos : camera.center, zoom: camera.zoom - 1 });
  }

  updateSelection() {
    const { currentRoute, zoom, selectionPreview } = this.props;
    if (!this.mapReady || !currentRoute?.driveCoords) {
      return;
    }
    // follow a range while it is being dragged out on the timeline
    const selection = selectionPreview || zoom;
    const partial = selection && (selection.start > 0 || selection.end < currentRoute.duration);
    this.map.getSource('selection').setData(selectionLine(currentRoute.driveCoords, partial ? selection : null));
  }

  onRef(el) {
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  }

  setPath(lines) {
    if (this.mapReady) {
      this.map.getSource('route').setData(lines);
      this.map.getSource('segmentLabels').setData(segmentLabelPoints(lines));
    }
  }

  posAtOffset(offset) {
    const { currentRoute } = this.props;
    if (!currentRoute.driveCoords) {
      return null;
    }

    const offsetSeconds = Math.floor(offset / 1e3);
    const offsetFractionalPart = (offset % 1e3) / 1000.0;
    const coordIdx = Math.max(this.state.driveCoordsMin, Math.min(
      offsetSeconds,
      this.state.driveCoordsMax,
    ));
    const nextCoordIdx = Math.max(this.state.driveCoordsMin, Math.min(
      offsetSeconds + 1,
      this.state.driveCoordsMax,
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

  onLoad() {
    const { map } = this;
    map.touchZoomRotate.disableRotation();

    map.addSource('route', {
      type: 'geojson',
      data: segmentLines({}),
    });
    map.addSource('segmentLabels', {
      type: 'geojson',
      data: segmentLabelPoints(segmentLines({})),
    });
    map.addSource('selection', {
      type: 'geojson',
      data: selectionLine({}, null),
    });
    map.addSource('seekPoint', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    const car = carIcon();
    map.addImage('car', car.image, { pixelRatio: car.pixelRatio });

    map.addLayer({
      id: 'selectionLine',
      type: 'line',
      source: 'selection',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#ffffff',
        'line-width': 16,
        'line-opacity': 0.5,
      },
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
        'line-color': routeLineColor(this.currentSegment ?? -1),
        'line-width': 8,
      },
    });
    map.addLayer({
      id: 'segmentLabels',
      type: 'symbol',
      source: 'segmentLabels',
      layout: {
        'text-field': ['to-string', ['get', 'segment']],
        'text-size': 13,
        'text-rotation-alignment': 'viewport',
        'text-offset': [0, -1.2],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(0, 0, 0, 0.8)',
        'text-halo-width': 2,
      },
    });
    map.addLayer({
      id: 'marker',
      type: 'symbol',
      source: 'seekPoint',
      layout: {
        'icon-image': 'car',
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        // always drawn, without hiding the segment numbers around it
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    this.mapReady = true;
    this.setState({ mapLoaded: true });
    this.updateCursor();

    const { currentRoute } = this.props;
    if (currentRoute?.driveCoords) {
      this.shouldFlyTo = false;
      const keys = Object.keys(currentRoute.driveCoords);
      this.setState({
        driveCoordsMin: Math.min(...keys),
        driveCoordsMax: Math.max(...keys),
      });
      this.populateMap();
    }
  }

  render() {
    const { mapLoaded } = this.state;
    const { currentRoute } = this.props;
    const loading = !mapLoaded || !currentRoute?.driveCoords;
    const missingCoordinates = !loading && !Number.isFinite(this.state.driveCoordsMin);
    return (
      <div ref={this.onRef} className="absolute inset-0">
        {/* important: mapbox makes its container position: relative */}
        <div ref={this.container} className="!absolute inset-0" />
        {loading && (
          <div role="status" aria-label="Loading map" className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[#1D2225]/80">
            <CircularProgress size={40} style={{ color: 'white' }} />
          </div>
        )}
        {missingCoordinates && (
          <div role="status" className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[#1D2225]/80 text-white text-center p-4">
            GPS data is not available for this drive.
          </div>
        )}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  selectionPreview: state.selectionPreview,
});

export default connect(stateToProps)(DriveMap);
