import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import { withStyles } from '@material-ui/core/styles';

import ReactMapGL, { LinearInterpolator } from 'react-map-gl';

import { MAPBOX_TOKEN } from '../../utils/geocode';
import { currentOffset } from '../../timeline/playback';
import { fetchDriveCoords } from '../../actions/cached';

const MAP_STYLE = 'mapbox://styles/commaai/cjj4yzqk201c52ss60ebmow0w';
const INTERACTION_TIMEOUT = 5000;

const styles = {
  mapContainer: {
    height: '100%',
    cursor: 'default !important',
    '& div': {
      height: '100% !important',
      width: '100% !important',
      minHeight: 300,
    },
  },
};

class DriveMap extends Component {
  constructor(props) {
    super(props);

    this.state = {
      viewport: {
        latitude: 37.7577,
        longitude: -122.4376,
        zoom: 15,
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

    this.ref = React.createRef();

    this.shouldFlyTo = false;
    this.isInteracting = false;
    this.isInteractingTimeout = null;
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
        const { offset } = this.props.currentRoute;

        const pos = this.posAtOffset(currentOffset() - offset);
        if (pos) {
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

    raf(this.updateMarkerPos);
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

    this.setPath(Object.values(currentRoute.driveCoords));
  }

  onRef(el) {
    this.ref.current = el;
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
    const { classes } = this.props;
    const { viewport } = this.state;
    return (
      <div ref={this.onRef} className={classes.mapContainer}>
        <ReactMapGL
          width="100%"
          height="100%"
          latitude={viewport.latitude}
          longitude={viewport.longitude}
          zoom={viewport.zoom}
          mapStyle={MAP_STYLE}
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

const stateToProps = Obstruction({
  offset: 'offset',
  currentRoute: 'currentRoute',
  startTime: 'startTime',
});

export default connect(stateToProps)(withStyles(styles)(DriveMap));
