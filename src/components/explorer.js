import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import PropTypes from 'prop-types';
import localforage from 'localforage';

import { withStyles, Modal, Paper, Typography, Button, CircularProgress, Divider } from '@material-ui/core';
import 'mapbox-gl/src/css/mapbox-gl.css';

import { devices as DevicesApi } from '@commaai/comma-api';

import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import DriveView from './DriveView';
import IosPwaPopup from './IosPwaPopup';
import NoDeviceUpsell from './DriveView/NoDeviceUpsell';
import AppDrawer from './AppDrawer';

import { analyticsEvent, selectDevice, updateDevice } from '../actions';
import ResizeHandler from './ResizeHandler';
import Colors from '../colors';
import { verifyPairToken, pairErrorToMessage } from '../utils';
import { play, pause } from '../timeline/playback';
import init from '../actions/startup';

const styles = (theme) => ({
  base: {
  },
  window: {
    background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
    display: 'flex',
    flexDirection: 'column',
  },
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
    maxWidth: '90%',
    left: '50%',
    top: '40%',
    transform: 'translate(-50%, -50%)',
    outline: 'none',
    '& p': { marginTop: 10 },
  },
  closeButton: {
    marginTop: 10,
    float: 'right',
    backgroundColor: Colors.grey200,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey400,
    },
  },
  fabProgress: {
    marginTop: 10,
  },
  pairedDongleId: {
    fontWeight: 'bold',
  },
});

class ExplorerApp extends Component {
  constructor(props) {
    super(props);

    this.state = {
      settingDongle: false,
      drawerIsOpen: false,
      headerRef: null,
      pairLoading: false,
      pairError: null,
      pairDongleId: null,
      windowWidth: window.innerWidth,
    };

    this.handleDrawerStateChanged = this.handleDrawerStateChanged.bind(this);
    this.updateHeaderRef = this.updateHeaderRef.bind(this);
    this.closePair = this.closePair.bind(this);
  }

  componentDidUpdate(prevProps, prevState) {
    const { pathname, dongleId, zoom } = this.props;

    if (prevProps.pathname !== pathname) {
      this.setState({ drawerIsOpen: false });
    }

    if (!prevProps.zoom && zoom) {
      this.props.dispatch(play());
    }
    if (prevProps.zoom && !zoom) {
      this.props.dispatch(pause());
    }
  }

  async componentDidMount() {
    const { pairLoading, pairError, pairDongleId } = this.state;

    window.scrollTo({ top: 0 });  // for ios header

    this.props.dispatch(init());

    let pairToken;
    try {
      pairToken = await localforage.getItem('pairToken');
    } catch (err) {
      console.log(err);
    }
    if (pairToken && !pairLoading && !pairError && !pairDongleId) {
      this.setState({ pairLoading: true });

      try {
        verifyPairToken(pairToken, true, 'explorer_pair_verify_pairtoken');
      } catch (err) {
        this.setState({ pairLoading: false, pairDongleId: null, pairError: `Error: ${err.message}` });
        await localforage.removeItem('pairToken');
        return;
      }

      try {
        const resp = await DevicesApi.pilotPair(pairToken);
        if (resp.dongle_id) {
          await localforage.removeItem('pairToken');
          this.setState({
            pairLoading: false,
            pairError: null,
            pairDongleId: resp.dongle_id,
          });

          const device = await DevicesApi.fetchDevice(resp.dongle_id);
          this.props.dispatch(updateDevice(device));
          this.props.dispatch(analyticsEvent('pair_device', {method: 'url_string'}));
        } else {
          await localforage.removeItem('pairToken');
          console.log(resp);
          this.setState({ pairDongleId: null, pairLoading: false, pairError: 'Error: could not pair, please try again' });
        }
      } catch(err) {
        await localforage.removeItem('pairToken');
        const msg = pairErrorToMessage(err, 'explorer_pair_pairtoken');
        this.setState({ pairDongleId: null, pairLoading: false, pairError: `Error: ${msg}, please try again` });
      }
    }

    this.componentDidUpdate({})
  }

  async closePair() {
    const { pairDongleId } = this.state;
    await localforage.removeItem('pairToken');
    if (pairDongleId) {
      this.props.dispatch(selectDevice(pairDongleId));
    }
    this.setState({ pairLoading: false, pairError: null, pairDongleId: null, settingDongle: pairDongleId });
  }

  handleDrawerStateChanged(drawerOpen) {
    this.setState({
      drawerIsOpen: drawerOpen
    });
  }

  updateHeaderRef(ref) {
    if (!this.state.headerRef) {
      this.setState({ headerRef: ref });
    }
  }

  render() {
    const { classes, zoom, devices, dongleId } = this.props;
    const { drawerIsOpen, pairLoading, pairError, pairDongleId, windowWidth } = this.state;

    const noDevicesUpsell = (devices && devices.length === 0 && !dongleId);
    const isLarge = noDevicesUpsell || windowWidth > 1080;

    const sidebarWidth = noDevicesUpsell ? 0 : Math.max(280, windowWidth * 0.2);
    const headerHeight = this.state.headerRef ?
      this.state.headerRef.getBoundingClientRect().height :
      (windowWidth < 640 ? 111 : 66);
    let containerStyles = {
      minHeight: `calc(100vh - ${headerHeight}px)`,
    };
    if (isLarge) {
      containerStyles = {
        ...containerStyles,
        width: `calc(100% - ${sidebarWidth}px)`,
        marginLeft: sidebarWidth,
      };
    }

    let drawerStyles = {
      minHeight: `calc(100vh - ${headerHeight}px)`,
    };

    return (
      <div className={classes.base}>
        <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
        <AppHeader drawerIsOpen={ drawerIsOpen } annotating={ Boolean(zoom) } showDrawerButton={ !isLarge }
          handleDrawerStateChanged={this.handleDrawerStateChanged} forwardRef={ this.updateHeaderRef } />
        <AppDrawer drawerIsOpen={ drawerIsOpen } isPermanent={ isLarge } width={ sidebarWidth }
          handleDrawerStateChanged={this.handleDrawerStateChanged} style={ drawerStyles } />
        <div className={ classes.window } style={ containerStyles }>
          { noDevicesUpsell ?
            <NoDeviceUpsell /> :
            (zoom ? <DriveView /> : <Dashboard />) }
        </div>
        <IosPwaPopup />
        <Modal open={ Boolean(pairLoading || pairError || pairDongleId) } onClose={ this.closePair }>
          <Paper className={classes.modal}>
            <Typography variant="title">Pairing device</Typography>
            <Divider />
            { pairLoading && <CircularProgress size={32} className={classes.fabProgress} /> }
            { pairDongleId &&
              <Typography>
                Successfully paired device <span className={ classes.pairedDongleId }>{ pairDongleId }</span>
              </Typography>
            }
            { pairError && <Typography>{ pairError }</Typography> }
            <Button variant="contained" className={ classes.closeButton } onClick={ this.closePair }>
              Close
            </Button>
          </Paper>
        </Modal>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  zoom: 'zoom',
  pathname: 'router.location.pathname',
  dongleId: 'dongleId',
  devices: 'devices',
});

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
