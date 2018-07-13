import React, { Component } from 'react';
import { classNames } from 'react-extras';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import Measure from 'react-measure';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import { LngLatBounds } from 'mapbox-gl';
import ReactMapGL, { LinearInterpolator } from 'react-map-gl';
import { easeCubic } from 'd3-ease';

import TimelineWorker from '../../timeline';

import RouteApi from '../../api/route';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiY29tbWFhaSIsImEiOiJjamlud2h2czAwNTN5M3dxZWg2Z3hmNnEwIn0.aam-7k03KBbMbtR7cUJslw';
const MAP_STYLE = 'mapbox://styles/commaai/cjj4yzqk201c52ss60ebmow0w';

const styles = {
  mapContainer: {
    width: '100%',
    cursor: 'default !important'
  }
}

class SingleMap extends Component {
  constructor (props) {
    super(props);

    this.initMap = this.initMap.bind(this);
    this.populateMap = this.populateMap.bind(this);
    this.posAtOffset = this.posAtOffset.bind(this);
    this.setPath = this.setPath.bind(this);
    this.updateMarkerPos = this.updateMarkerPos.bind(this);

    let nextRoute = props.currentSegment && props.currentSegment.route;

    this.state = {
      viewport: {
        width: 400,
        height: 400,
        latitude: 37.7577,
        longitude: -122.4376,
        zoom: 13
      },
      route: nextRoute,
      coords: [],
    };
  }

  componentWillReceiveProps (nextProps) {
    let nextRoute = nextProps.currentSegment && nextProps.currentSegment.route;

    if (nextRoute !== this.state.route) {
      if (this.state.coords.length > 0) {
        this.setPath([]);
      }

      if (this.map && nextProps.segments[nextProps.segmentNum]) {
        this.setState({ route: nextRoute }, this.populateMap.bind(this, nextProps));
      }
    }

    if (nextProps.startTime !== this.props.startTime) {
      this.shouldFlyTo = true;
    }
  }

  componentDidMount() {
    this.mounted = true;
    this.updateMarkerPos();
  }

  componentWillUnmount () {
    this.mounted = false;
  }

  getMarkerSource() {
    return this.map && this.map.getMap().getSource('seekPoint');
  }

  updateMarkerPos() {
    if (!this.mounted) {
      return;
    }

    let markerSource = this.getMarkerSource()
    if (markerSource) {
      if (this.props.currentSegment && this.state.coords.length > 0) {
        const { routeOffset } = this.props.currentSegment;
        const offset = TimelineWorker.currentOffset();

        const pos = this.posAtOffset(offset - routeOffset);
        if (pos) {
          markerSource.setData({
            "type": "Point",
            "coordinates": pos
          });
          this.moveViewportTo(pos);
        }
      } else if (markerSource._data && markerSource._data.coordinates.length > 0) {
        markerSource.setData({
          "type": "Point",
          "coordinates": []
        });
      }
    }

    raf(this.updateMarkerPos);
  }

  moveViewportTo(pos) {
    let viewport = {
      ...this.state.viewport,
      longitude: pos[0],
      latitude: pos[1]
    };
    if (this.shouldFlyTo) {
      viewport.transitionDuration = 200;
      viewport.transitionInterpolator = new LinearInterpolator();
      this.shouldFlyTo = false;
    }

    this.setState({ viewport });
  }

  populateMap = async (props) => {
    if (!props) props = this.props;

    if (!this.map || !props.currentSegment || !this.state.route || !props.segments[this.props.segmentNum]) {
      return;
    }
    let route = this.state.route;
    let routeSigUrl = props.currentSegment.url;
    let { startCoord, endCoord } = props.segments[props.segmentNum];

    const coords = await RouteApi(routeSigUrl).getCoords();
    if (this.state.route !== route) {
      // handle race, if route changes while coords request was in flight
      return;
    }

    const coordsArr = coords.map(coord => [coord.lng, coord.lat]);
    this.setPath(coordsArr);
  }

  setPath(coords) {
    let map = this.map && this.map.getMap();
    this.setState({ coords });

    if (map) {
      map.getSource('route').setData({
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "LineString",
            "coordinates": coords,
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

    let map = mapComponent.getMap();

    map.on('load', () => {
      map.addSource('route', {
        "type": "geojson",
        "data": {
          "type": "Feature",
          "properties": {},
          "geometry": {
              "type": "LineString",
              "coordinates": [],
          }
        }
      });
      map.addSource('seekPoint', {
        "type": "geojson",
        "data": {
          "type": "Point",
          "coordinates": []
        }
      });

      const lineGeoJson = {
        "id": "routeLine",
        "type": "line",
        "source": "route",
        "layout": {
          "line-join": "round",
          "line-cap": "round"
        },
        "paint": {
          "line-color": "#888",
          "line-width": 8
        }
      };
      map.addLayer(lineGeoJson);

      const markerGeoJson = {
        "id": "marker",
        "type": "circle",
        "paint": {
            "circle-radius": 10,
            "circle-color": "#007cbf"
        },
        "source": "seekPoint"
      };

      map.addLayer(markerGeoJson);

      this.map = mapComponent;

      if (this.state.route && this.props.currentSegment) {
        this.populateMap();
      }
    });
  }

  render () {
    return (
      <Measure
        bounds
        onResize={(contentRect) => {
          this.setState({ viewport: {...this.state.viewport, width: contentRect.bounds.width } })
        }}
      >
        {({ measureRef }) =>
          <div ref={ measureRef } className={ this.props.classes.mapContainer }>
            <ReactMapGL
              {...this.state.viewport}
              mapStyle={ MAP_STYLE }
              onViewportChange={(viewport) => this.setState({viewport})}
              mapboxApiAccessToken={ MAPBOX_TOKEN }
              attributionControl={ false }
              ref={ this.initMap }
              dragPan={ false }
            />
          </div>
        }
      </Measure>
    );
  }
}

const stateToProps = Obstruction({
  offset: 'workerState.offset',
  route: 'workerState.route',
  segments: 'workerState.segments',
  segmentNum: 'workerState.segment',
  currentSegment: 'workerState.currentSegment',
  startTime: 'workerState.startTime'
});

export default connect(stateToProps)(withStyles(styles)(SingleMap));
