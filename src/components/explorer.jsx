import React, { Component } from 'react';
import { connect } from 'react-redux';
import localforage from 'localforage';
import { push } from 'connected-react-router';

import { withStyles, Button, CircularProgress, Modal, Paper, Typography } from '@material-ui/core';
import 'mapbox-gl/src/css/mapbox-gl.css';

import { api } from '../api/backend';

import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import IosPwaPopup from './IosPwaPopup';
import AppDrawer from './AppDrawer';
import BodyTeleop from './BodyTeleop';
import TimeSelect from './TimeSelect';
import UploadQueue from './Files/UploadQueue';

import { analyticsEvent, selectDevice, updateDevices, streamNav } from '../actions';
import { closeOverlay } from '../actions/history';
import Colors from '../colors';
import { play, pause } from '../timeline/playback';
import { verifyPairToken, pairErrorToMessage } from '../utils';
import { subscribeWindowSize } from '../hooks/window';
import { overlayFromSearch } from '../url';

import DriveView from './DriveView';
import NoDeviceUpsell from './DriveView/NoDeviceUpsell';
import Referrals from './Referrals';

const styles = (theme) => ({
  app: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  window: {
    background: '#1D2225',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
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
    this.closeBodyTeleop = this.closeBodyTeleop.bind(this);
  }

  closeBodyTeleop() {
    this.props.dispatch(streamNav(false));
  }

  async componentDidMount() {
    const { pairLoading, pairError, pairDongleId } = this.state;

    this.unsubscribeWindowSize = subscribeWindowSize(({ width }) => {
      this.setState({ windowWidth: width });
    });

    window.scrollTo({ top: 0 }); // for ios header

    let pairToken;
    try {
      pairToken = await localforage.getItem('pairToken');
    } catch (err) {
      console.error(err);
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
        const resp = await api.devices.pilotPair(pairToken);
        if (resp.dongle_id) {
          await localforage.removeItem('pairToken');
          this.setState({
            pairLoading: false,
            pairError: null,
            pairDongleId: resp.dongle_id,
          });

          const devices = await api.devices.listDevices();
          this.props.dispatch(updateDevices(devices));
          this.props.dispatch(analyticsEvent('pair_device', { method: 'url_string' }));
        } else {
          await localforage.removeItem('pairToken');
          console.log(resp);
          this.setState({ pairDongleId: null, pairLoading: false, pairError: 'Error: could not pair, please try again' });
        }
      } catch (err) {
        await localforage.removeItem('pairToken');
        const msg = pairErrorToMessage(err, 'explorer_pair_pairtoken');
        this.setState({ pairDongleId: null, pairLoading: false, pairError: `Error: ${msg}, please try again` });
      }
    }

    this.componentDidUpdate({});
  }

  componentWillUnmount() {
    this.unsubscribeWindowSize?.();
  }

  componentDidUpdate(prevProps) {
    const { pathname, zoom, overlay } = this.props;
    const overlayChanged = prevProps.overlay?.kind !== overlay?.kind
      || prevProps.overlay?.dongleId !== overlay?.dongleId;

    if (prevProps.pathname !== pathname || overlayChanged) {
      this.setState({ drawerIsOpen: false });
    }

    if (!prevProps.zoom && zoom) {
      this.props.dispatch(play());
    }
    if (prevProps.zoom && !zoom) {
      this.props.dispatch(pause());
    }
  }

  async closePair() {
    const { pairDongleId } = this.state;
    await localforage.removeItem('pairToken');
    if (pairDongleId) {
      this.props.dispatch(selectDevice(pairDongleId));
    }
    this.setState({ pairLoading: false, pairError: null, pairDongleId: null });
  }

  handleDrawerStateChanged(drawerOpen) {
    this.setState({
      drawerIsOpen: drawerOpen,
    });
  }

  updateHeaderRef(ref) {
    if (!this.state.headerRef) {
      this.setState({ headerRef: ref });
    }
  }

  render() {
    const {
      classes, currentRoute, device, devices, dispatch, dongleId, bodyTeleopOpen, selectedRouteId, profile, overlay, destinationKind,
    } = this.props;
    const { drawerIsOpen, pairLoading, pairError, pairDongleId, windowWidth } = this.state;

    const noDevicesUpsell = (devices?.length === 0 && !dongleId);
    const referralsOpen = destinationKind === 'referrals';
    const isLarge = noDevicesUpsell || windowWidth > 1080;

    const sidebarWidth = noDevicesUpsell ? 0 : Math.max(280, windowWidth * 0.2);
    const headerHeight = this.state.headerRef
      ? this.state.headerRef.getBoundingClientRect().height
      : (windowWidth < 640 ? 111 : 66);
    let containerStyles = {};
    if (isLarge) {
      containerStyles = {
        ...containerStyles,
        width: `calc(100% - ${sidebarWidth}px)`,
        marginLeft: sidebarWidth,
      };
    }
    const drawerStyles = {
      minHeight: `calc(100vh - ${headerHeight}px)`,
    };

    return (
      <div className={classes.app}>
        { bodyTeleopOpen && <BodyTeleop onClose={ this.closeBodyTeleop } /> }
        { !bodyTeleopOpen && (
          <>
            <AppHeader
              drawerIsOpen={ drawerIsOpen }
              viewingRoute={ Boolean(currentRoute) }
              showDrawerButton={ !isLarge }
              handleDrawerStateChanged={this.handleDrawerStateChanged}
              forwardRef={ this.updateHeaderRef }
            />
            <AppDrawer
              drawerIsOpen={ drawerIsOpen }
              isPermanent={ isLarge }
              width={ sidebarWidth }
              handleDrawerStateChanged={this.handleDrawerStateChanged}
              style={ drawerStyles }
            />
            <div className={ classes.window } style={ containerStyles }>
              { referralsOpen
                ? <Referrals profile={profile} onBack={() => dispatch(push(dongleId ? `/${dongleId}` : '/'))} />
                : noDevicesUpsell
                ? <NoDeviceUpsell />
                : ((currentRoute || selectedRouteId) ? <DriveView /> : <Dashboard />)}
            </div>
            <IosPwaPopup />
          </>
        ) }
        { /* Overlays are global dialogs layered over whatever page is active,
              including stream/teleop; hoisting them out of the page branch is
              what makes a cold URL like /:dongleId/stream?settings=:dongle
              render its dialog. The dates overlay self-limits to the
              dashboard because its Save reshapes the dashboard's route list.
              The settings modal stays mounted when closed so its cold-URL
              alias adoption can run on arrival of a late device fetch. */ }
        <DeviceSettingsModal
          isOpen={ overlay?.kind === 'settings' }
          dongleId={ overlay?.dongleId ?? null }
          onClose={ () => dispatch(closeOverlay()) }
        />
        { overlay?.kind === 'dates' && destinationKind === 'dashboard' && (
          <TimeSelect onClose={ () => dispatch(closeOverlay()) } />
        ) }
        { overlay?.kind === 'uploads' && (() => {
          // The queue targets the device named in the URL; `1` (no dongleId)
          // means the currently selected one. One app-level instance is the
          // single owner of the upload polling loop.
          const uploadsDevice = overlay.dongleId
            ? devices?.find((d) => d.dongle_id === overlay.dongleId)
              || (device?.dongle_id === overlay.dongleId ? device : null)
            : device;
          return uploadsDevice && (
            <UploadQueue
              open
              update
              device={ uploadsDevice }
              onClose={ () => dispatch(closeOverlay()) }
            />
          );
        })() }
        <Modal open={ Boolean(pairLoading || pairError || pairDongleId) } onClose={ this.closePair }>
              <Paper className={classes.modal}>
                <Typography variant="title">Pairing device</Typography>
                <hr />
                { pairLoading && <CircularProgress size={32} className={classes.fabProgress} /> }
                { pairDongleId
                  && (
                  <Typography>
                    {'Successfully paired device '}
                    <span className={ classes.pairedDongleId }>{ pairDongleId }</span>
                  </Typography>
                  )}
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

const stateToProps = (state) => ({
  zoom: state.zoom,
  pathname: state.router.location.pathname,
  dongleId: state.dongleId,
  device: state.device,
  devices: state.devices,
  currentRoute: state.currentRoute,
  selectedRouteId: state.selectedRouteId,
  bodyTeleopOpen: state.streamNav,
  profile: state.profile,
  destinationKind: state.destinationKind,
  // Dialog overlays live in the URL: rendering reads them straight from the
  // location, so cold loads, refresh, and Back/Forward need no reconciliation.
  overlay: overlayFromSearch(state.router.location.search),
});

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
