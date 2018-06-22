import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';


import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import { LngLatBounds } from 'mapbox-gl';
import ReactMapGL from 'react-map-gl';

import TimelineWorker from '../../timeline';

import RouteApi from '../../api/route';

const styles = theme => {
  root: {}
};

const MAPBOX_TOKEN = 'pk.eyJ1IjoiY29tbWFhaSIsImEiOiJjamlud2h2czAwNTN5M3dxZWg2Z3hmNnEwIn0.aam-7k03KBbMbtR7cUJslw';

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

    this.initMap = this.initMap.bind(this);
    this.posAtOffset = this.posAtOffset.bind(this);
    this.updateMarkerPos = this.updateMarkerPos.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    let nextRoute = nextProps.segment && nextProps.segment.route;

    if (nextRoute && nextRoute !== this.state.route) {
      let map = this.map.getMap();
      this.setState({ route: nextRoute });

      RouteApi(nextProps.segment.url).getCoords().then(coords => {
        const coordsArr = coords.map(coord => [coord.lng, coord.lat]);
        this.setState({ coords: coordsArr });
        map.getSource('route').setData({
          "type": "Feature",
          "properties": {},
          "geometry": {
              "type": "LineString",
              "coordinates": coordsArr,
          }
        });

        var bounds = coordsArr.reduce(function(bounds, coord) {
          return bounds.extend(coord);
        }, new LngLatBounds(coordsArr[0], coordsArr[1]));
        map.fitBounds(bounds, { padding: 20 });
      });
    }
  }

  componentDidMount() {
    this.updateMarkerPos();
  }

  updateMarkerPos() {
    if (this.props.segment) {
      const { routeOffset } = this.props.segment;
      const offset = TimelineWorker.currentOffset();

      const pos = this.posAtOffset(offset - routeOffset);
      if (pos && this.map) {
        this.map.getMap().getSource('seekPoint').setData({
          "type": "Point",
          "coordinates": pos
        });
      }
    }
    raf(this.updateMarkerPos);
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
    });
  }

  render () {
    return (
      <React.Fragment>
        <ReactMapGL
          {...this.state.viewport}
          mapStyle={this.state.mapStyle}
          onViewportChange={(viewport) => this.setState({viewport})}
          mapboxApiAccessToken={ MAPBOX_TOKEN }
          attributionControl={ false }
          ref={ this.initMap }
        />
      </React.Fragment>
    );
  }
}

const stateToProps = Obstruction({
  offset: 'workerState.offset',
  route: 'workerState.route',
  segment: 'workerState.currentSegment',
  startTime: 'workerState.startTime'
});

export default connect(stateToProps)(withStyles(styles)(SingleMap));
