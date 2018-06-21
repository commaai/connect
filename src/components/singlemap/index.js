import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import ReactMapGL from 'react-map-gl';

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
    }
  }
  render () {
    return (
      <React.Fragment>
        <ReactMapGL
          {...this.state.viewport}
          onViewportChange={(viewport) => this.setState({viewport})}
        />
      </React.Fragment>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(SingleMap));
