import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';

import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';

import { selectRange, selectDevice, primeNav } from '../../actions';
import { filterEvent } from '../../utils';
import DeviceList from './DeviceList';
import DriveList from './DriveList';
import Prime from '../Prime';
import PrimeBanner from '../Prime/PrimeBanner'

const ZOOM_BUFFER = 1000; // 1 second on either end

const styles = (theme) => ({
  base: {
    background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
    display: 'flex',
    overflow: 'hidden',
    flexGrow: 1,
    minWidth: '100%',
  },
  sidebar: {
    background: 'linear-gradient(180deg, #1B2023 0%, #111516 100%)',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 280,
    width: '20%',
  },
  sidebarHeader: {
    alignItems: 'center',
    padding: 24,
  },
  window: {
    display: 'flex',
    flexGrow: 1,
    flexDirection: 'column',
  },
  annotateButton: {
    background: '#fff',
    borderRadius: 30,
    color: '#404B4F',
    height: 50,
    textTransform: 'none',
    width: '80%',
    '&:hover': {
      background: '#fff',
      color: '#404B4F',
    }
  },
});

class Dashboard extends Component {
  constructor(props) {
    super(props);

    this.handleDeviceSelected = this.handleDeviceSelected.bind(this);
    this.goToAnnotation = this.goToAnnotation.bind(this);
  }

  handleDeviceSelected(dongleId) {
    this.props.dispatch(selectDevice(dongleId));
  }

  goToAnnotation(segment) {
    if (segment == null) { return; }
    const startTime = segment.startTime - ZOOM_BUFFER;
    const endTime = segment.startTime + segment.duration + ZOOM_BUFFER;
    this.props.dispatch(selectRange(startTime, endTime));
  }

  render() {
    const { classes, primeNav, device } = this.props;
    let firstAnnotationSegment = null;
    const newAnnotations = this.props.segments.reduce((count, segment) => {
      const segCount = segment.events.filter(filterEvent).reduce((memo, event) => (event.id ? memo : memo + 1), 0);
      if (!firstAnnotationSegment && segCount > 0) {
        firstAnnotationSegment = segment;
      }
      return count + segCount;
    }, 0);

    return (
      <div className={classes.base}>
        <div className={classes.sidebar}>
          <div className={classes.sidebarHeader}>
            <Button
              size="large"
              className={classes.annotateButton}
              onClick={partial(this.goToAnnotation, firstAnnotationSegment)}
            >
              Annotate
            </Button>
          </div>
          <DeviceList
            selectedDevice={this.props.selectedDongleId}
            handleDeviceSelected={this.handleDeviceSelected}
          />
        </div>

        <div className={classes.window}>
          { primeNav ?
            ( <Prime /> )
          : ( <>
            { !device.prime && device.is_owner && <PrimeBanner collapsed /> }
            <DriveList />
          </> ) }
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  selectedDongleId: 'workerState.dongleId',
  primeNav: 'workerState.primeNav',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));
