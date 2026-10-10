import React, { Component } from 'react';
import { connect } from 'react-redux';
import localforage from 'localforage';
import { push, replace } from 'connected-react-router';

import { withStyles, Button, CircularProgress, Modal, Paper, Typography } from '@material-ui/core';
import 'mapbox-gl/src/css/mapbox-gl.css';

import { api } from '../api/backend';

import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import IosPwaPopup from './IosPwaPopup';
import AppDrawer from './AppDrawer';
import BodyTeleop from './BodyTeleop';

import { analyticsEvent, selectDevice, updateDevices, streamNav, modalNav } from '../actions';
import init from '../actions/startup';
import Colors from '../colors';
import { play, pause } from '../timeline/playback';
import { verifyPairToken, pairErrorToMessage } from '../utils';
import { subscribeWindowSize } from '../hooks/window';

import DriveView from './DriveView';
import NoDeviceUpsell from './DriveView/NoDeviceUpsell';
import Referrals from './Referrals';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import AddDevice from './Dashboard/AddDevice';
import UploadQueue from './Files/UploadQueue';
import { ROUTES, buildUrl, parseQuery } from '../url';

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

    const { r } = parseQuery(this.props.location.search);
    if (r) {
      this.props.dispatch(replace(r));
    }

    this.props.dispatch(init());

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

  componentDidUpdate(prevProps, prevState) {
    const { pathname, zoom } = this.props;

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
      classes, currentRoute, devices, dispatch, dongleId, bodyTeleopOpen, selectedRouteId, profile, navigation, device,
    } = this.props;
    const { drawerIsOpen, pairLoading, pairError, pairDongleId, windowWidth } = this.state;

    const noDevicesUpsell = (devices?.length === 0 && !dongleId);
    const referralsOpen = navigation?.type === ROUTES.REFERRALS;
    const modal = navigation?.query.modal;
    const settingsId = navigation?.query.device || dongleId;
    const settingsDevice = devices?.find((d) => d.dongle_id === settingsId) || (device?.dongle_id === settingsId ? device : null);
    const canManageSettings = settingsDevice && (settingsDevice.is_owner || profile?.superuser);
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
        { bodyTeleopOpen ? (
          <BodyTeleop onClose={ this.closeBodyTeleop } />
        ) : (
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
            {canManageSettings && (navigation?.type === ROUTES.SETTINGS || modal === 'settings') && (
              <DeviceSettingsModal key={settingsId} dongleId={settingsId} isOpen={!['uploads', 'add-device'].includes(modal)}
                onClose={() => dispatch(modal === 'settings' ? modalNav(null) : replace(buildUrl({ dongleId })))} />
            )}
            {modal === 'add-device' && devices && <AddDevice modalOnly />}
            {modal === 'uploads' && canManageSettings && (!selectedRouteId || navigation?.query.device) && (
              <UploadQueue open update device={settingsDevice} onClose={() => dispatch(modalNav(null))} />
            )}
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
          </>
        ) }
      </div>
    );
  }
}

const stateToProps = (state) => ({
  navigation: state.navigation,
  device: state.device,
  location: state.router.location,
  zoom: state.zoom,
  pathname: state.router.location.pathname,
  dongleId: state.dongleId,
  devices: state.devices,
  currentRoute: state.currentRoute,
  selectedRouteId: state.selectedRouteId,
  limit: state.limit,
  bodyTeleopOpen: state.streamNav,
  profile: state.profile,
});

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
