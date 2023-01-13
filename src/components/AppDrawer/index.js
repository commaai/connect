import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { Link } from 'react-router-dom';

import SwipeableDrawer from '@material-ui/core/SwipeableDrawer';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';

import 'mapbox-gl/src/css/mapbox-gl.css';

import DeviceList from '../Dashboard/DeviceList';

import { selectDevice } from '../../actions';

const styles = () => ({
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
  logo: {
    alignItems: 'center',
    display: 'flex',
    textDecoration: 'none',
    minHeight: 64,
  },
  logoImg: {
    height: 34,
    width: 18.9,
    margin: '0px 28px',
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
  versionNumber: {
    fontSize: 14,
    height: 16,
    color: 'transparent',
    alignSelf: 'flex-end',
  },
});

class AppDrawer extends Component {
  constructor(props) {
    super(props);

    this.handleDeviceSelected = this.handleDeviceSelected.bind(this);
  }

  handleDeviceSelected(dongleId) {
    const { dispatch, handleDrawerStateChanged } = this.props;
    dispatch(selectDevice(dongleId));
    handleDrawerStateChanged(false);
  }

  render() {
    const { classes, isPermanent, drawerIsOpen, handleDrawerStateChanged, selectedDongleId, width } = this.props;

    const version = process.env.REACT_APP_GIT_SHA || 'dev';

    // const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    return (
      <SwipeableDrawer
        open={ isPermanent || drawerIsOpen }
        onOpen={() => handleDrawerStateChanged(true)}
        onClose={() => handleDrawerStateChanged(false)}
        variant={ isPermanent ? 'permanent' : 'temporary' }
        disableBackdropTransition={false}
        disableDiscovery={false}
        disableSwipeToOpen={false}
        PaperProps={{ style: { width, top: 'auto' } }}
      >
        <div className={classes.drawerContent}>
          { !isPermanent
            && (
              <Link to="/" className={ classes.logo }>
                <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
                <Typography className={ classes.logoText }>connect</Typography>
              </Link>
            )}
          { isPermanent && <div style={{ height: 24 }} /> }
          <DeviceList
            selectedDevice={ selectedDongleId }
            handleDeviceSelected={this.handleDeviceSelected}
            headerHeight={ 64 + (isPermanent ? 24 + 16 : 0) }
          />
          { isPermanent && <div className={classes.versionNumber}>{version}</div> }
        </div>
      </SwipeableDrawer>
    );
  }
}

const stateToProps = Obstruction({
  selectedDongleId: 'dongleId',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(AppDrawer));
