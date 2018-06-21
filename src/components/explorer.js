import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Slide from '@material-ui/core/Slide';
import Typography from '@material-ui/core/Typography';
import 'mapbox-gl/dist/mapbox-gl.css';

import Annotations from './annotations';
import Header from './header';
import Dashboard from './dashboard';

const styles = theme => {
  return {
  };
};

class ExplorerApp extends Component {
  render() {
    return (
      <div>
        <Header />
        <Slide direction='down' in={ !this.props.expanded } mountOnEnter unmountOnExit>
          <Dashboard />
        </Slide>
        <Slide direction='up' in={ this.props.expanded } mountOnEnter unmountOnExit>
          <Annotations />
        </Slide>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  expanded: 'zoom.expanded'
});

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
