import React, { Component } from 'react';
import { connect } from 'react-redux';

import ReactMapGL, { LinearInterpolator } from 'react-map-gl';

import { seek } from '../../actions';
import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset, seek as seekVideo } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

const INTERACTION_TIMEOUT = 5000;

const SEGMENT_DURATION = 60 * 1000;
// how close to the marker a press grabs it, in pixels
const MARKER_GRAB_RADIUS = 24;
// points this close (in degrees, ~20m) count as the same place
const SAME_PLACE = 0.0002;

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

// the selected stretch of the drive, drawn as a halo under the route
function selectionLine(driveCoords, selection) {
  const coordinates = selection
    ? Object.entries(driveCoords)
      .filter(([second]) => second * 1000 >= selection.start && second * 1000 <= selection.end)
      .map(([, coord]) => coord)
    : [];
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
}

// The drive offset whose position is nearest to [lng, lat]. Where the drive
// passes the same place more than once, the pass closest in time to `around`
// wins, so dragging along the route stays continuous.
export function offsetNearest(driveCoords, [lng, lat], around) {
  const scale = Math.cos((lat * Math.PI) / 180);
  const points = Object.entries(driveCoords).map(([second, [x, y]]) => ({
    offset: second * 1000,
    distance: Math.hypot((x - lng) * scale, y - lat),
  }));
  if (!points.length) {
    return null;
  }
  const closest = Math.min(...points.map((point) => point.distance));
  const tolerance = Math.max(closest * 2, SAME_PLACE);
  return points
    .filter((point) => point.distance <= tolerance)
    .sort((a, b) => Math.abs(a.offset - around) - Math.abs(b.offset - around))[0].offset;
}

class DriveMap extends Component {
  constructor(props) {
    super(props);

    this.state = {
      markerDragging: false,
      viewport: {
        ...DEFAULT_LOCATION,
        zoom: 14,
      },
      driveCoordsMin: null,
      driveCoordsMax: null,
    };

    this.onRef = this.onRef.bind(this);
    this.onViewportChange = this.onViewportChange.bind(this);
    this.initMap = this.initMap.bind(this);
    this.populateMap = this.populateMap.bind(this);
    this.posAtOffset = this.posAtOffset.bind(this);
    this.setPath = this.setPath.bind(this);
    this.updateMarkerPos = this.updateMarkerPos.bind(this);
    this.onInteraction = this.onInteraction.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onClick = this.onClick.bind(this);

    this.shouldFlyTo = false;
    this.isInteracting = false;
    this.isInteractingTimeout = null;
    this.lastMapPos = [0, 0];
    this.lastOffset = null;
    this.currentSegment = null;
    this.dragOffset = null;
  }

  componentDidMount() {
    this.mounted = true;
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

    if (zoom !== prevProps.zoom) {
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
  }

  // press on the marker to drag it along the route
  onPointerDown(ev) {
    const map = this.map && this.map.getMap();
    if (!map || !this.props.currentRoute?.driveCoords) {
      return;
    }
    const marker = map.project(this.lastMapPos);
    if (Math.hypot(marker.x - ev.point[0], marker.y - ev.point[1]) <= MARKER_GRAB_RADIUS) {
      this.dragOffset = currentOffset();
      this.setState({ markerDragging: true });
    }
  }

  onPointerMove(ev) {
    if (!this.state.markerDragging) {
      return;
    }
    this.dragOffset = offsetNearest(this.props.currentRoute.driveCoords, ev.lngLat, this.dragOffset);
    seekVideo(this.dragOffset);
  }

  onPointerUp() {
    if (!this.state.markerDragging) {
      return;
    }
    this.setState({ markerDragging: false });
    this.props.dispatch(seek(this.dragOffset));
  }

  // tap the route to jump there
  onClick(ev) {
    const { currentRoute, dispatch } = this.props;
    if (ev.features?.length && currentRoute?.driveCoords) {
      dispatch(seek(offsetNearest(currentRoute.driveCoords, ev.lngLat, currentOffset())));
    }
  }

  onInteraction(ev) {
    if (ev.isDragging || ev.isRotating || ev.isZooming) {
      this.shouldFlyTo = true;
      this.isInteracting = true;

      if (this.isInteractingTimeout !== null) {
        clearTimeout(this.isInteractingTimeout);
      }
      this.isInteractingTimeout = setTimeout(() => {
        this.isInteracting = false;
      }, INTERACTION_TIMEOUT);
    }
  }

  updateMarkerPos() {
    if (!this.mounted) {
      return;
    }

    const markerSource = this.map && this.map.getMap().getSource('seekPoint');
    if (markerSource) {
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
          this.map.getMap().setPaintProperty('routeLine', 'line-color', routeLineColor(segment));
        }
        const pos = this.posAtOffset(offset);
        if (pos && pos.some((coordinate, index) => coordinate != this.lastMapPos[index])) {
          this.lastMapPos = pos;
          markerSource.setData({
            type: 'Point',
            coordinates: pos,
          });
          if (!this.isInteracting && !this.state.markerDragging) {
            this.moveViewportTo(pos);
          }
        }
      } else if (markerSource._data && markerSource._data.coordinates.length > 0) {
        markerSource.setData({
          type: 'Point',
          coordinates: [],
        });
      }
    }

    requestAnimationFrame(this.updateMarkerPos);
  }

  moveViewportTo(pos) {
    const viewport = {
      longitude: pos[0],
      latitude: pos[1],
    };
    if (this.shouldFlyTo) {
      viewport.transitionDuration = 200;
      viewport.transitionInterpolator = new LinearInterpolator();
      this.shouldFlyTo = false;
    }

    this.setState((prevState) => ({
      viewport: {
        ...prevState.viewport,
        ...viewport,
      },
    }));
  }

  async populateMap() {
    const { currentRoute } = this.props;

    if (!this.map || !currentRoute || !currentRoute.driveCoords) {
      return;
    }

    this.setPath(segmentLines(currentRoute.driveCoords));
    this.updateSelection();
  }

  updateSelection() {
    const { currentRoute, zoom } = this.props;
    const map = this.map && this.map.getMap();
    if (!map || !currentRoute?.driveCoords) {
      return;
    }
    const partial = zoom && (zoom.start > 0 || zoom.end < currentRoute.duration);
    map.getSource('selection').setData(selectionLine(currentRoute.driveCoords, partial ? zoom : null));
  }

  onRef(el) {
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  }

  onViewportChange(viewport) {
    this.setState({ viewport });
  }

  setPath(lines) {
    const map = this.map && this.map.getMap();

    if (map) {
      map.getSource('route').setData(lines);
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

  initMap(mapComponent) {
    if (!mapComponent) {
      this.map = null;
      return;
    }

    const map = mapComponent.getMap();
    if (!map) {
      this.map = null;
      return;
    }

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: segmentLines({}),
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

      const lineGeoJson = {
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
      };
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
      map.addLayer(lineGeoJson);

      const markerGeoJson = {
        id: 'marker',
        type: 'circle',
        paint: {
          'circle-radius': 10,
          'circle-color': '#007cbf',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
        source: 'seekPoint',
      };

      map.addLayer(markerGeoJson);

      this.map = mapComponent;

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
    });
  }

  render() {
    const { viewport, markerDragging } = this.state;
    return (
      <div ref={this.onRef} className="h-full cursor-default [&_div]:h-full [&_div]:w-full [&_div]:min-h-[300px]">
        <ReactMapGL
          width="100%"
          height="100%"
          latitude={viewport.latitude}
          longitude={viewport.longitude}
          zoom={viewport.zoom}
          mapStyle={MAPBOX_STYLE}
          maxPitch={0}
          mapboxApiAccessToken={MAPBOX_TOKEN}
          ref={this.initMap}
          onContextMenu={null}
          dragRotate={false}
          onViewportChange={this.onViewportChange}
          attributionControl={false}
          onInteractionStateChange={this.onInteraction}
          dragPan={!markerDragging}
          interactiveLayerIds={['routeLine']}
          clickRadius={10}
          onMouseDown={this.onPointerDown}
          onTouchStart={this.onPointerDown}
          onMouseMove={this.onPointerMove}
          onTouchMove={this.onPointerMove}
          onMouseUp={this.onPointerUp}
          onTouchEnd={this.onPointerUp}
          onClick={this.onClick}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
});

export default connect(stateToProps)(DriveMap);
