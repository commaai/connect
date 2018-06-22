import React, { Component } from 'react';
import classNames from '@sindresorhus/class-names';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import Measure from 'react-measure';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import { LngLatBounds } from 'mapbox-gl';
import ReactMapGL from 'react-map-gl';

import TimelineWorker from '../../timeline';

import RouteApi from '../../api/route';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiY29tbWFhaSIsImEiOiJjamlud2h2czAwNTN5M3dxZWg2Z3hmNnEwIn0.aam-7k03KBbMbtR7cUJslw';

const styles = {
  mapContainer: {
    width: '100%',
    height: '500'
  }
}

class SingleMap extends Component {
  state = {
    viewport: {
      width: 400,
      height: 400,
      latitude: 37.7577,
      longitude: -122.4376,
      zoom: 8
    },
    route: null,
    coords: [],
  }

  constructor(props){
    super(props);

    this.fitBounds = this.fitBounds.bind(this);
    this.initMap = this.initMap.bind(this);
    this.populateMap = this.populateMap.bind(this);
    this.posAtOffset = this.posAtOffset.bind(this);
    this.setPath = this.setPath.bind(this); 
    this.updateMarkerPos = this.updateMarkerPos.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    let nextRoute = nextProps.segment && nextProps.segment.route;

    if (nextRoute !== this.state.route) {
      this.setState({ route: nextRoute }, this.populateMap);
    }
  }   

  componentDidMount() {
    this.updateMarkerPos();
  }

  updateMarkerPos() {
    let markerSource = this.map && this.map.getMap().getSource('seekPoint');
    if (markerSource) {
      if (this.props.segment && this.state.coords.length > 0) {
        const { routeOffset } = this.props.segment;
        const offset = TimelineWorker.currentOffset();

        const pos = this.posAtOffset(offset - routeOffset);
        if (pos) {
          markerSource.setData({
            "type": "Point",
            "coordinates": pos
          });
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

  populateMap = async () => {
    this.setPath([]);
    if (!this.map || !this.props.segment || !this.state.route || !this.props.segments[this.props.segment.segment]) return;
    let route = this.state.route;
    let routeSigUrl = this.props.segment.url;
    let { startCoord, endCoord } = this.props.segments[this.props.segment.segment];
    let bounds = new LngLatBounds(startCoord, endCoord);
    this.fitBounds(bounds);

    const coords = await RouteApi(routeSigUrl).getCoords();
    if (this.state.route !== route) {
      // handle race, if route changes while coords request was in flight
      return;
    }

    const coordsArr = coords.map(coord => [coord.lng, coord.lat]);
    this.setPath(coordsArr);
  }

  fitBounds(latLngBounds) {
    this.map.getMap().fitBounds(latLngBounds, { padding: 20 });
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
      if (coords.length > 1) {
        let bounds = coords.reduce(function(bounds, coord) {
          return bounds.extend(coord);
        }, new LngLatBounds(coords[0], coords[1]));
        this.fitBounds(bounds);
      }
    }
  }

  posAtOffset(offset) {
    const coordsIdx = Math.floor(offset / 1e3);
    return this.state.coords[coordsIdx];
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

      if (this.state.route && this.props.segment) {
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
              mapStyle={this.state.mapStyle}
              onViewportChange={(viewport) => this.setState({viewport})}
              mapboxApiAccessToken={ MAPBOX_TOKEN }
              attributionControl={ false }
              ref={ this.initMap }
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
  segment: 'workerState.currentSegment',
  startTime: 'workerState.startTime'
});

export default connect(stateToProps)(withStyles(styles)(SingleMap));
