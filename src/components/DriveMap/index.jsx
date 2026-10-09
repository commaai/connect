import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress } from '@material-ui/core';

import mapboxgl from 'mapbox-gl';

import { pushTimelineRange, seek } from '../../actions';
import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset, seek as seekVideo } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

const INTERACTION_TIMEOUT = 5000;

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
    this.lastOffset = null;
    this.currentSegment = null;
    this.dragOffset = null;
  }

  componentDidMount() {
    this.mounted = true;

    const map = new mapboxgl.Map({
      container: this.container.current,
      style: MAPBOX_STYLE,
      accessToken: MAPBOX_TOKEN,
      center: [DEFAULT_LOCATION.longitude, DEFAULT_LOCATION.latitude],
      zoom: 14,
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

    // the map is hidden and shown again with the map/video tabs
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => map.resize());
      this.resizeObserver.observe(this.container.current);
    }

    this.componentDidUpdate({}, {});
    this.updateMarkerPos();
  }

  componentDidUpdate(prevProps) {
    const { dispatch, currentRoute, zoom } = this.props;

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
    seekVideo(this.dragOffset);
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

    if (this.props.visible === false || !this.mapReady) {
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
      if (pos && pos.some((coordinate, index) => coordinate != this.lastMapPos[index])) {
        this.lastMapPos = pos;
        markerSource.setData({
          type: 'Point',
          coordinates: pos,
        });
        this.followMarker(pos);
      }
    } else if (markerSource._data && markerSource._data.coordinates.length > 0) {
      markerSource.setData({
        type: 'Point',
        coordinates: [],
      });
    }

    requestAnimationFrame(this.updateMarkerPos);
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
      data: {
        type: 'Point',
        coordinates: [],
      },
    });

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
      type: 'circle',
      paint: {
        'circle-radius': 10,
        'circle-color': '#007cbf',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
      source: 'seekPoint',
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
      <div ref={this.onRef} className="relative h-full min-h-[300px] w-full">
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
