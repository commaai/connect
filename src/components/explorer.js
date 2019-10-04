import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import PropTypes from 'prop-types';

import { withStyles } from '@material-ui/core/styles';
import 'mapbox-gl/dist/mapbox-gl.css';

import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import Annotations from './Annotations';

import Timelineworker from '../timeline';
import { selectRange } from '../actions';
import { getDongleID, getZoom } from '../url';

const styles = (/* theme */) => ({
  base: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'flex',
    height: 64,
    minHeight: 64,
  },
  window: {
    display: 'flex',
    flexGrow: 1,
    minHeight: 0,
  },
});

class ExplorerApp extends Component {
  constructor(props) {
    super(props);

    this.state = {
      settingDongle: null
    };
  }

  componentWillMount() {
    this.checkProps(this.props);
  }

  componentWillReceiveProps(props) {
    this.checkProps(props);

    const isZoomed = props.expanded;
    const { expanded } = this.props;
    const wasZoomed = expanded;

    if (isZoomed && !wasZoomed) {
      Timelineworker.play();
    }
    if (!isZoomed && wasZoomed) {
      Timelineworker.pause();
    }
  }

  checkProps(props) {
    const dongleId = getDongleID(props.pathname);
    const zoom = getZoom(props.pathname);

    const { settingDongle } = this.state;
    const curDongle = settingDongle || props.dongleId;

    if (dongleId) {
      if (curDongle !== dongleId) {
        Timelineworker.selectDevice(dongleId);
        this.setState({
          settingDongle: dongleId
        });
      } else {
        this.setState({
          settingDongle: null
        });
      }
    }
    const { dispatch } = this.props;
    dispatch(selectRange(zoom.start, zoom.end));
  }

  render() {
    const { classes, expanded } = this.props;
    return (
      <div className={classes.base}>
        <div className={classes.header}>
          <AppHeader />
        </div>
        <div className={classes.window}>
          { expanded ? (<Annotations />) : (<Dashboard />) }
        </div>
      </div>
    );
  }
}

ExplorerApp.propTypes = {
  expanded: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
  classes: PropTypes.object.isRequired
};

const stateToProps = Obstruction({
  expanded: 'zoom.expanded',
  pathname: 'router.location.pathname',
  dongleId: 'workerState.dongleId'
});

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
