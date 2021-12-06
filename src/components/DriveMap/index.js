import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import { withStyles } from '@material-ui/core/styles';
import * as Sentry from '@sentry/react';

import ReactMapGL, { LinearInterpolator } from 'react-map-gl';

import { derived as DerivedDataApi } from '@commaai/comma-api';
import { MAPBOX_TOKEN } from '../../api/geocode';
import { currentOffset } from '../../timeline/playback';

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
  }
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
      coords: [],
    };

    this.initMap = this.initMap.bind(this);
    this.populateMap = this.populateMap.bind(this);
    this.posAtOffset = this.posAtOffset.bind(this);
    this.setPath = this.setPath.bind(this);
    this.updateMarkerPos = this.updateMarkerPos.bind(this);
    this.onInteraction = this.onInteraction.bind(this);

    this.isLoadingCoords = false;
    this.shouldFlyTo = false;
    this.isInteracting = false;
    this.isInteractingTimeout = null;
    this.isInteractingMouseDown = false;
  }

  componentDidMount() {
    this.mounted = true;
    this.componentDidUpdate({}, {});
    this.updateMarkerPos();
  }

  componentDidUpdate(prevProps) {
    const prevRoute = prevProps.currentSegment ? prevProps.currentSegment.route : null;
    const route = this.props.currentSegment ? this.props.currentSegment.route : null;
    if (prevRoute !== route) {
      if (this.state.coords.length > 0) {
        this.setPath([]);
      }
      if (route) {
        this.populateMap();
      };
    }

    if (prevProps.startTime && prevProps.startTime !== this.props.startTime) {
      this.shouldFlyTo = true;
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
      this.isInteractingTimeout = setTimeout(() => this.isInteracting = false, INTERACTION_TIMEOUT);
    }
  }

  updateMarkerPos() {
    if (!this.mounted) {
      return;
    }

    const markerSource = this.map && this.map.getMap().getSource('seekPoint');
    if (markerSource) {
      if (this.props.currentSegment && this.state.coords.length > 0) {
        const { routeOffset } = this.props.currentSegment;

        const pos = this.posAtOffset(currentOffset() - routeOffset);
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
          coordinates: []
        });
      }
    }

    raf(this.updateMarkerPos);
  }

  moveViewportTo(pos) {
    const viewport = {
      ...this.state.viewport,
      longitude: pos[0],
      latitude: pos[1],
    };
    if (this.shouldFlyTo) {
      viewport.transitionDuration = 200;
      viewport.transitionInterpolator = new LinearInterpolator();
      this.shouldFlyTo = false;
    }

    this.setState({ viewport });
  }

  async populateMap() {
    const { currentSegment } = this.props;
    if (!this.map || !currentSegment) {
      return;
    }
    this.isLoadingCoords = true;

    const { route, url, segments } = currentSegment;
    try {
      const coords = await DerivedDataApi(url).getCoords(segments);
      if (this.props.currentSegment.route !== route) {
        return;
      }

      const coordsArr = coords.map((coord) => [coord.lng, coord.lat]);
      this.setPath(coordsArr);
    } catch(err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'drivemap_populate_deriveddrivedata' });
    } finally {
      this.isLoadingCoords = false;
    }
  }

  setPath(coords) {
    const map = this.map && this.map.getMap();
    this.setState({ coords });

    if (map) {
      map.getSource('route').setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coords,
        }
      });
    }
  }

  posAtOffset(offset) {
    const offsetSeconds = Math.floor(offset / 1e3);
    const offsetFractionalPart = (offset % 1e3) / 1000.0;
    const coordIdx = Math.min(
      offsetSeconds,
      this.state.coords.length - 1
    );
    const nextCoordIdx = Math.min(
      offsetSeconds + 1,
      this.state.coords.length - 1
    );
    if (!this.state.coords[coordIdx]) {
      return null;
    }

    const [floorLng, floorLat] = this.state.coords[coordIdx];
    const [ceilLng, ceilLat] = this.state.coords[nextCoordIdx];

    return [
      floorLng + ((ceilLng - floorLng) * offsetFractionalPart),
      floorLat + ((ceilLat - floorLat) * offsetFractionalPart)
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
          }
        }
      });
      map.addSource('seekPoint', {
        type: 'geojson',
        data: {
          type: 'Point',
          coordinates: []
        }
      });

      const lineGeoJson = {
        id: 'routeLine',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#888',
          'line-width': 8
        }
      };
      map.addLayer(lineGeoJson);

      const markerGeoJson = {
        id: 'marker',
        type: 'circle',
        paint: {
          'circle-radius': 10,
          'circle-color': '#007cbf'
        },
        source: 'seekPoint'
      };

      map.addLayer(markerGeoJson);

      this.map = mapComponent;

      if (this.props.currentSegment) {
        this.populateMap();
      }
    });
  }

  render() {
    const { classes } = this.props;
    return (
      <div className={ classes.mapContainer }>
        <ReactMapGL width="100%" height="100%" {...this.state.viewport} mapStyle={MAP_STYLE} maxPitch={ 0 }
          mapboxApiAccessToken={MAPBOX_TOKEN} ref={this.initMap} onContextMenu={ null } dragRotate={ false }
          onViewportChange={(viewport) => this.setState({ viewport })} attributionControl={ false }
          onInteractionStateChange={ this.onInteraction } />
      </div>
    );
  }
}

const stateToProps = Obstruction({
  offset: 'offset',
  segments: 'segments',
  currentSegment: 'currentSegment',
  startTime: 'startTime',
});

export default connect(stateToProps)(withStyles(styles)(DriveMap));
