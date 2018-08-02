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

import Timelineworker from '../timeline';
import { selectRange } from '../actions';
import { getDongleID, getZoom } from '../url';

const styles = theme => {
  return {
    base: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    },
    header: {
      display: 'flex',
      height: 96,
      minHeight: 96,
    },
    window: {
      display: 'flex',
      flexGrow: 1,
    },
  };
};

class ExplorerApp extends Component {
  constructor (props) {
    super(props);

    this.state = {
      settingDongle: null
    };
  }
  componentWillMount () {
    this.checkProps(this.props);
  }
  componentWillReceiveProps (props) {
    this.checkProps(props);

    var isZoomed = props.expanded;
    var wasZoomed = this.props.expanded;

    if (isZoomed && !wasZoomed) {
      Timelineworker.play();
    }
    if (!isZoomed && wasZoomed) {
      Timelineworker.pause();
    }
  }
  checkProps (props) {
    var dongleId = getDongleID(props.pathname);
    var zoom = getZoom(props.pathname);

    let curDongle = this.state.settingDongle || props.dongleId;

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
    this.props.dispatch(selectRange(zoom.start, zoom.end));
  }

  render() {
    const { classes, expanded } = this.props;
    return (
      <div className={ classes.base }>
        <div className={ classes.header }>
          <Header />
        </div>
        <div className={ classes.window }>
          { expanded ? (<Annotations />) : (<Dashboard />) }
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  expanded: 'zoom.expanded',
  pathname: 'router.location.pathname',
  dongleId: 'workerState.dongleId'
});

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
