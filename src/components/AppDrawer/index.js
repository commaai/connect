import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { Link } from 'react-router-dom';

import { withStyles } from '@material-ui/core/styles';
import 'mapbox-gl/src/css/mapbox-gl.css';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import Drawer from '@material-ui/core/Drawer';

import DeviceList from '../Dashboard/DeviceList';

import { filterEvent } from '../../utils';
import { selectRange, selectDevice } from '../../actions';

const ZOOM_BUFFER = 1000; // 1 second on either end

const styles = (/* theme */) => ({
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
  annotateButton: {
    background: '#fff',
    borderRadius: 30,
    margin: 24,
    color: '#404B4F',
    height: 50,
    textTransform: 'none',
    width: '80%',
    '&:hover': {
      background: '#fff',
      color: '#404B4F',
    }
  },
  logo: {
    alignItems: 'center',
    display: 'flex',
    textDecoration: 'none',
    minHeight: 64,
  },
  logoImg: {
    height: '34px',
    margin: '0px 28px',
    width: 'auto',
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
  },
  drawerContent: {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(180deg, #1B2023 0%, #111516 100%)',
  },
  sidebarHeader: {
    alignItems: 'center',
    padding: 14.5,
    color: '#fff',
    display: 'flex',
    width: '100%',
    paddingLeft: 0,
    backgroundColor: '#1D2225',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
});

class AppDrawer extends Component {
  constructor(props) {
    super(props);

    this.handleDeviceSelected = this.handleDeviceSelected.bind(this);
    this.goToAnnotation = this.goToAnnotation.bind(this);
    this.toggleDrawerOff = this.toggleDrawerOff.bind(this);

  }

  handleDeviceSelected(dongleId) {
    this.props.dispatch(selectDevice(dongleId));
    this.toggleDrawerOff();
  }

  goToAnnotation(segment) {
    if (segment == null) { return; }
    const startTime = segment.startTime - ZOOM_BUFFER;
    const endTime = segment.startTime + segment.duration + ZOOM_BUFFER;
    this.props.dispatch(selectRange(startTime, endTime));
  }

  toggleDrawerOff() {
    this.props.handleDrawerStateChanged(false);
  }

  render() {
    const { classes, isPermanent, drawerIsOpen, selectedDongleId } = this.props;
    let firstAnnotationSegment = null;
    const newAnnotations = this.props.segments.reduce((count, segment) => {
      const segCount = segment.events.filter(filterEvent).reduce((memo, event) => (event.id ? memo : memo + 1), 0);
      if (!firstAnnotationSegment && segCount > 0) {
        firstAnnotationSegment = segment;
      }
      return count + segCount;
    }, 0);

    return (
      <Drawer open={ isPermanent || drawerIsOpen } onClose={this.toggleDrawerOff}
        variant={ isPermanent ? "permanent" : "temporary" }
        PaperProps={{ style: { width: this.props.width, top: 'auto' }}}>
        <div className={classes.drawerContent}>
          { !isPermanent &&
            <Link to="/" className={ classes.logo }>
              <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
              <Typography className={ classes.logoText }>explorer</Typography>
            </Link>
          }
          <Button size="large" className={classes.annotateButton}
            onClick={() => { this.toggleDrawerOff(); this.goToAnnotation(firstAnnotationSegment); }}>
            Annotate
          </Button>
          <DeviceList selectedDevice={ selectedDongleId } handleDeviceSelected={this.handleDeviceSelected}
            headerHeight={ 64 + 96 } />
        </div>
      </Drawer>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  selectedDongleId: 'workerState.dongleId',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(AppDrawer));
