import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import ReactMapGL from 'react-map-gl';
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
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.segment && nextProps.segment
        && nextProps.segment.route !== this.props.segment.route) {
      // TODO clear map


      // fetch coords
      RouteApi(nextProps.segment.url).getCoords().then(coords => {
        const coordsArr = coords.map(coord => [coord.lng, coord.lat]);
        const geoJson = {
          "id": "route",
          "type": "line",
          "source": {
          "type": "geojson",
          "data": {
              "type": "Feature",
              "properties": {},
              "geometry": {
                  "type": "LineString",
                  "coordinates": coordsArr,
              }
            }
          },
          "layout": {
            "line-join": "round",
            "line-cap": "round"
          },
          "paint": {
            "line-color": "#888",
            "line-width": 8
          }
        };

        this.map.getMap().addLayer(geoJson);
      });
    }
  }


  render () {
    return (
      <React.Fragment>
        <ReactMapGL
          {...this.state.viewport}
          mapStyle={this.state.mapStyle}
          onViewportChange={(viewport) => this.setState({viewport})}
          mapboxApiAccessToken={ MAPBOX_TOKEN }
          ref={(map) => { this.map = map; }}
        />
      </React.Fragment>
    );
  }
}

const stateToProps = Obstruction({
  route: 'workerState.route',
  segment: 'workerState.currentSegment'
});

export default connect(stateToProps)(withStyles(styles)(SingleMap));
