import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress } from '@material-ui/core';

import ReactMapGL, { LinearInterpolator } from 'react-map-gl';

import { fetchDriveCoords } from '../../actions/cached';
import { MyLocation } from '../../icons';
import { currentOffset } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

const INTERACTION_TIMEOUT = 5000;

class DriveMap extends Component {
  constructor(props) {
    super(props);

    this.state = {
      viewport: {
        ...DEFAULT_LOCATION,
        zoom: 14,
      },
      driveCoordsMin: null,
      driveCoordsMax: null,
      mapReady: false,
      offCenter: false,
    };

    this.onRef = this.onRef.bind(this);
    this.onViewportChange = this.onViewportChange.bind(this);
    this.initMap = this.initMap.bind(this);
    this.populateMap = this.populateMap.bind(this);
    this.posAtOffset = this.posAtOffset.bind(this);
    this.setPath = this.setPath.bind(this);
    this.updateMarkerPos = this.updateMarkerPos.bind(this);
    this.onInteraction = this.onInteraction.bind(this);
    this.recenter = this.recenter.bind(this);

    this.shouldFlyTo = false;
    this.isInteracting = false;
    this.isInteractingTimeout = null;
    this.lastMapPos = [0, 0];
  }

  componentDidMount() {
    this.mounted = true;
    this.componentDidUpdate({}, {});
    this.updateMarkerPos();
  }

  componentDidUpdate(prevProps) {
    const { dispatch, currentRoute, startTime } = this.props;

    const prevRoute = prevProps.currentRoute?.fullname || null;
    const route = currentRoute?.fullname || null;
    if (prevRoute !== route) {
      this.setPath([]);
      if (route) {
        dispatch(fetchDriveCoords(currentRoute));
      }
    }

    if (prevProps.startTime && prevProps.startTime !== startTime) {
      this.shouldFlyTo = true;
    }

    if (currentRoute && prevProps.currentRoute && currentRoute.driveCoords
      && prevProps.currentRoute.driveCoords !== currentRoute.driveCoords) {
      this.shouldFlyTo = false;
      this.rememberCoords(currentRoute.driveCoords);
      this.populateMap();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    if (this.isInteractingTimeout !== null) clearTimeout(this.isInteractingTimeout);
  }

  onInteraction(ev) {
    if (!(ev.isDragging || ev.isPanning || ev.isRotating || ev.isZooming)) return;
    this.shouldFlyTo = true;
    this.isInteracting = true;
    if (!this.state.offCenter) this.setState({ offCenter: true });

    if (this.isInteractingTimeout !== null) clearTimeout(this.isInteractingTimeout);
    this.isInteractingTimeout = setTimeout(() => {
      this.isInteracting = false;
      if (this.mounted) this.setState({ offCenter: false });
    }, INTERACTION_TIMEOUT);
  }

  recenter() {
    if (this.isInteractingTimeout !== null) {
      clearTimeout(this.isInteractingTimeout);
      this.isInteractingTimeout = null;
    }
    this.isInteracting = false;
    this.shouldFlyTo = true;
    this.setState({ offCenter: false });
    const pos = this.posAtOffset(currentOffset());
    if (pos) this.moveViewportTo(pos);
  }

  updateMarkerPos() {
    if (!this.mounted) {
      return;
    }

    const markerSource = this.map && this.map.getMap().getSource('seekPoint');
    if (markerSource) {
      if (this.props.currentRoute && this.props.currentRoute.driveCoords) {
        const pos = this.posAtOffset(currentOffset());
        if (pos && pos.some((coordinate, index) => coordinate != this.lastMapPos[index])) {
          this.lastMapPos = pos;
          markerSource.setData({
            type: 'Point',
            coordinates: pos,
          });
          if (!this.isInteracting) {
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

  rememberCoords(driveCoords) {
    const keys = Object.keys(driveCoords);
    if (!keys.length) {
      this.revealSettled();
      return;
    }
    this.setState({
      driveCoordsMin: Math.min(...keys),
      driveCoordsMax: Math.max(...keys),
    }, () => {
      if (!this.map || this.revealed) return;
      const pos = this.posAtOffset(currentOffset());
      if (!pos) {
        this.revealSettled();
        return;
      }
      this.lastMapPos = pos;
      this.shouldFlyTo = false;
      this.setState((prev) => ({
        viewport: {
          ...prev.viewport,
          longitude: pos[0],
          latitude: pos[1],
        },
      }), () => this.revealSettled());
    });
  }

  revealSettled() {
    if (this.revealed || !this.map || !this.mounted) return;
    this.revealed = true;
    const map = this.map.getMap();
    map.resize();
    const show = () => {
      if (this.mounted) this.setState({ mapReady: true });
    };
    // The playhead keeps the camera moving, so idle may never come.
    // The next paints already have the route position; idle covers the paused case.
    map.once('idle', show);
    requestAnimationFrame(() => requestAnimationFrame(show));
  }

  async populateMap() {
    const { currentRoute } = this.props;

    if (!this.map || !currentRoute || !currentRoute.driveCoords) {
      return;
    }

    this.setPath(Object.values(currentRoute.driveCoords));
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

      this.map = mapComponent;
      map.resize();

      const { currentRoute } = this.props;
      if (currentRoute?.driveCoords) {
        this.shouldFlyTo = false;
        this.rememberCoords(currentRoute.driveCoords);
        this.populateMap();
      }
    });
  }

  render() {
    const { viewport } = this.state;
    return (
      <div ref={this.onRef} className="relative h-full w-full cursor-default">
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
        />
        {!this.state.mapReady && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black">
            <CircularProgress style={{ color: '#fff' }} thickness={4} size={32} />
          </div>
        )}
        {this.state.mapReady && (
          <button
            type="button"
            aria-label="Center map"
            aria-hidden={!this.state.offCenter}
            tabIndex={this.state.offCenter ? 0 : -1}
            onClick={this.recenter}
            className={`absolute top-3 right-3 z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white/70 ring-1 ring-white/10 backdrop-blur-md transition-[opacity,scale,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] motion-reduce:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-white/25 [@media(hover:hover)_and_(pointer:fine)]:hover:text-white ${this.state.offCenter ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'}`}
          >
            <MyLocation className="h-[22px] w-[22px]" />
          </button>
        )}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  offset: state.offset,
  currentRoute: state.currentRoute,
  startTime: state.startTime,
});

export default connect(stateToProps)(DriveMap);
