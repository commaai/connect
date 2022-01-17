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
    };

    this.initMap = this.initMap.bind(this);
    this.populateMap = this.populateMap.bind(this);
    this.posAtOffset = this.posAtOffset.bind(this);
    this.setPath = this.setPath.bind(this);
    this.updateMarkerPos = this.updateMarkerPos.bind(this);
    this.onInteraction = this.onInteraction.bind(this);

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
      this.setPath([]);
      if (route) {
        this.props.dispatch(fetchDriveCoords(this.props.currentSegment));
      };
    }

    if (prevProps.startTime && prevProps.startTime !== this.props.startTime) {
      this.shouldFlyTo = true;
    }


    if (this.props.currentSegment && prevProps.currentSegment &&
      prevProps.currentSegment.driveCoords !== this.props.currentSegment.driveCoords)
    {
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
      this.isInteractingTimeout = setTimeout(() => this.isInteracting = false, INTERACTION_TIMEOUT);
    }
  }

  updateMarkerPos() {
    if (!this.mounted) {
      return;
    }

    const markerSource = this.map && this.map.getMap().getSource('seekPoint');
    if (markerSource) {
      if (this.props.currentSegment && this.props.currentSegment.driveCoords) {
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
    if (!this.map || !currentSegment || !currentSegment.driveCoords) {
      return;
    }

    const coordsArr = currentSegment.driveCoords.map((cs) => cs.c);
    this.setPath(coordsArr);
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
        }
      });
    }
  }

  posAtOffset(offset) {
    if (!this.props.currentSegment.driveCoords) {
      return null;
    }

    const offsetSeconds = Math.floor(offset / 1e3);
    const offsetFractionalPart = (offset % 1e3) / 1000.0;
    const coordIdx = Math.min(
      offsetSeconds,
      this.props.currentSegment.driveCoords.length - 1
    );
    const nextCoordIdx = Math.min(
      offsetSeconds + 1,
      this.props.currentSegment.driveCoords.length - 1
    );
    if (!this.props.currentSegment.driveCoords[coordIdx]) {
      return null;
    }

    const [floorLng, floorLat] = this.props.currentSegment.driveCoords[coordIdx].c;
    const [ceilLng, ceilLat] = this.props.currentSegment.driveCoords[nextCoordIdx].c;

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

      if (this.props.currentSegment && this.props.currentSegment.driveCoords) {
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
