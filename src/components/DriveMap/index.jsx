import React, { Component } from 'react';
import { connect } from 'react-redux';

import ReactMapGL from 'react-map-gl';

import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

const INTERACTION_TIMEOUT = 5000;
const GESTURE_STALE = 2000; // a gesture whose end was never reported (a crash, a cancelled touch) stops blocking updates
const ZOOM_SETTLE = 150; // after the last wheel/pinch zoom event, bring the car back to the center
const FOLLOW_INTERVAL = 50; // ms between marker/camera updates: every map update is a full WebGL repaint
// street level, so what is around the car can be read, in the small window and expanded alike
const ZOOM = 17;
const MIN_ZOOM = 10; // a whole drive
const MAX_ZOOM = 19; // building level

class DriveMap extends Component {
  constructor(props) {
    super(props);

    this.state = {
      viewport: {
        ...DEFAULT_LOCATION,
        zoom: ZOOM,
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

    this.isInteracting = false;
    this.isInteractingTimeout = null;
    this.zoomTimeout = null;
    this.gesturing = false;
    this.gestureTimeout = null;
    this.lastMapPos = [0, 0];
    this.lastFollow = 0;
  }

  componentDidMount() {
    this.mounted = true;
    this.componentDidUpdate({}, {});
    this.updateMarkerPos();
  }

  componentDidUpdate(prevProps) {
    const { dispatch, currentRoute, seekId } = this.props;

    const prevRoute = prevProps.currentRoute?.fullname || null;
    const route = currentRoute?.fullname || null;
    if (prevRoute !== route) {
      this.setPath([]);
      if (route) {
        dispatch(fetchDriveCoords(currentRoute));
      }
    }

    if (prevProps.seekId !== seekId) {
      // the user jumped somewhere else: follow the car there, even right after panning the map
      clearTimeout(this.isInteractingTimeout);
      this.isInteracting = false;
      this.lastMapPos = [0, 0];
    }

    if (currentRoute && prevProps.currentRoute && currentRoute.driveCoords
      && prevProps.currentRoute.driveCoords !== currentRoute.driveCoords) {
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
    clearTimeout(this.zoomTimeout);
    clearTimeout(this.gestureTimeout);
  }

  onInteraction(ev) {
    this.gesturing = Boolean(ev.isDragging); // a finger or mouse button is down on the map
    clearTimeout(this.gestureTimeout);
    if (this.gesturing) {
      this.gestureTimeout = setTimeout(() => { this.gesturing = false; }, GESTURE_STALE);
    }
    // isDragging is the only flag that is false when the gesture ends: the controller never resets
    // isZooming/isPanning after a wheel zoom, so it must be checked first
    if (ev.isDragging || ev.isRotating) {
      this.isInteracting = true;
      clearTimeout(this.isInteractingTimeout);
      this.isInteractingTimeout = setTimeout(() => {
        this.isInteracting = false;
        this.lastMapPos = [0, 0]; // bring the camera back to the car even if it is not moving
      }, INTERACTION_TIMEOUT);
    } else if (ev.isZooming) {
      // zooming moves the view towards the pointer: let it, then bring the car back to the center once
      this.zooming = true;
      clearTimeout(this.zoomTimeout);
      this.zoomTimeout = setTimeout(() => {
        this.zooming = false;
        this.lastMapPos = [0, 0];
      }, ZOOM_SETTLE);
    }
  }

  updateMarkerPos(now = performance.now()) {
    if (!this.mounted) {
      return;
    }
    if (document.hidden || now - this.lastFollow < FOLLOW_INTERVAL) {
      requestAnimationFrame(this.updateMarkerPos);
      return;
    }
    this.lastFollow = now;

    const markerSource = this.map && this.map.getMap().getSource('seekPoint');
    if (markerSource) {
      if (this.props.currentRoute && this.props.currentRoute.driveCoords) {
        const pos = this.posAtOffset(currentOffset());
        // while a gesture is on screen every map update is another draw competing with it: catch up afterwards
        if (!this.gesturing && !this.zooming && pos && pos.some((coordinate, index) => coordinate != this.lastMapPos[index])) {
          this.lastMapPos = pos;
          markerSource.setData({
            type: 'Point',
            coordinates: pos,
          });
          if (!this.isInteracting && !this.zooming) {
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
    this.setState((prevState) => ({
      viewport: { ...prevState.viewport, longitude: pos[0], latitude: pos[1] },
    }));
  }

  async populateMap() {
    const { currentRoute } = this.props;

    if (!this.map || !currentRoute || !currentRoute.driveCoords) {
      return;
    }

    const path = Object.values(currentRoute.driveCoords);
    this.setPath(path);
    const endpoints = this.map.getMap().getSource('endpoints');
    if (endpoints && path.length > 1) {
      const point = (coordinates, color) => ({ type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates } });
      endpoints.setData({
        type: 'FeatureCollection',
        features: [point(path[0], '#22c55e'), point(path[path.length - 1], '#ef4444')],
      });
    }
  }

  onRef(el) {
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  }

  onViewportChange(viewport) {
    this.setState({ viewport });
  }

  setPath(coords) {
    const map = this.map && this.map.getMap();

    if (map) {
      map.getSource('route').setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      });
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
      // no GPS for this second (a gap in the drive's log): keep the car where it was last seen, or will first be
      // seen. Returning nothing left a map built during the gap (e.g. after rotating a phone) on DEFAULT_LOCATION.
      let known = coordIdx;
      while (known > this.state.driveCoordsMin && !currentRoute.driveCoords[known]) known -= 1;
      while (known < this.state.driveCoordsMax && !currentRoute.driveCoords[known]) known += 1;
      return currentRoute.driveCoords[known] || null;
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

      map.addSource('endpoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
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

      // start (green) and end (red) of the drive, under the car marker
      map.addLayer({
        id: 'endpoints',
        type: 'circle',
        source: 'endpoints',
        paint: {
          'circle-radius': 9,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
        },
      });

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

      this.map = mapComponent;

      const { currentRoute } = this.props;
      if (currentRoute?.driveCoords) {
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
    const { viewport } = this.state;
    return (
      <div ref={this.onRef} className="h-full cursor-default [&_div]:h-full [&_div]:w-full">
        <ReactMapGL
          width="100%"
          height="100%"
          latitude={viewport.latitude}
          longitude={viewport.longitude}
          zoom={viewport.zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          // react-map-gl 5 glides after a pinch and divides by the time since the last event: on an iPhone that
          // can be 0 ms, giving scale 0, a thrown assertion and a map stuck mid-gesture (see pinch.test.js)
          touchZoom={{ inertia: 0 }}
          // let mapbox draw once per frame; by default react-map-gl forces a synchronous draw per touch move
          asyncRender
          mapStyle={MAPBOX_STYLE}
          maxPitch={0}
          mapboxApiAccessToken={MAPBOX_TOKEN}
          ref={this.initMap}
          onContextMenu={null}
          dragRotate={false}
          onViewportChange={this.onViewportChange}
          attributionControl={false}
          onInteractionStateChange={this.onInteraction}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  offset: state.offset,
  currentRoute: state.currentRoute,
  seekId: state.seekId,
});

export default connect(stateToProps)(DriveMap);
