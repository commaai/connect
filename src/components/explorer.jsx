import React, { Component } from 'react';
import { connect } from 'react-redux';
import localforage from 'localforage';
import { replace } from 'connected-react-router';
import { createPath } from 'history';

import { withStyles, Button, CircularProgress, Modal, Paper, Typography } from '@material-ui/core';
import 'mapbox-gl/src/css/mapbox-gl.css';

import { api } from '../api/backend';

import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import IosPwaPopup from './IosPwaPopup';
import AppDrawer from './AppDrawer';
import BodyTeleop from './BodyTeleop';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import AddDevice from './Dashboard/AddDevice';

import { analyticsEvent, updateDevices } from '../actions';
import { closeDialog, navigateTo } from '../actions/history';
import init from '../actions/startup';
import Colors from '../colors';
import { play, pause } from '../timeline/playback';
import { getDeviceFromState, verifyPairToken, pairErrorToMessage } from '../utils';
import { subscribeWindowSize } from '../hooks/window';
import { normalizeInternalUrl, selectUrl } from '../url';

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

const canManageDevice = (device, profile) => Boolean(device?.is_owner || profile?.superuser);
const deviceDialogs = ['settings', 'settings-uploads'];

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
    this.props.dispatch(navigateTo({ page: 'dashboard' }));
  }

  async componentDidMount() {
    const { pairLoading, pairError, pairDongleId } = this.state;

    this.unsubscribeWindowSize = subscribeWindowSize(({ width }) => {
      this.setState({ windowWidth: width });
    });

    window.scrollTo({ top: 0 }); // for ios header

    const q = new URLSearchParams(window.location.search);
    if (q.has('r')) {
      const redirect = normalizeInternalUrl(q.get('r'));
      q.delete('r');
      this.props.dispatch(replace(redirect || createPath({
        pathname: window.location.pathname,
        search: q.toString(),
        hash: window.location.hash,
      })));
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
    const {
      device, devices, dialog, dispatch, dongleId, pathname, profile, settingsDevice, zoom,
    } = this.props;

    if (prevProps.pathname !== pathname) {
      this.setState({ drawerIsOpen: false });
    }

    if (!prevProps.zoom && zoom) {
      this.props.dispatch(play());
    }
    if (prevProps.zoom && !zoom) {
      this.props.dispatch(pause());
    }

    const authenticated = api.auth.isAuthenticated();
    const unavailableDeviceDialog = deviceDialogs.includes(dialog)
      && (!authenticated
        || (Array.isArray(devices) && !canManageDevice(settingsDevice, profile)));
    const unavailablePairingDialog = dialog === 'add-device' && !authenticated;
    const unavailableFilterDialog = dialog === 'filter'
      && Array.isArray(devices) && !dongleId;
    const unavailableUploadsDialog = dialog === 'uploads'
      && (!authenticated || (device && !canManageDevice(device, profile)));
    if (unavailableDeviceDialog || unavailablePairingDialog
      || unavailableFilterDialog || unavailableUploadsDialog) {
      dispatch(closeDialog());
    }
  }

  async closePair() {
    const { pairDongleId } = this.state;
    await localforage.removeItem('pairToken');
    if (pairDongleId) {
      this.props.dispatch(navigateTo({ page: 'dashboard', dongleId: pairDongleId }));
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
      classes, device, devices, dialog, dialogDongleId, dispatch, dongleId, page, profile,
      settingsDevice,
    } = this.props;
    const { drawerIsOpen, pairLoading, pairError, pairDongleId, windowWidth } = this.state;

    const noDevicesUpsell = (devices?.length === 0 && !dongleId);
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
    let pageContent;
    if (page === 'not-found') {
      pageContent = <Typography variant="title">Page not found</Typography>;
    } else if (page === 'referrals') {
      pageContent = (
        <Referrals
          profile={profile}
          onBack={() => dispatch(navigateTo({ page: dongleId ? 'dashboard' : 'home' }))}
        />
      );
    } else if (noDevicesUpsell) {
      pageContent = <NoDeviceUpsell />;
    } else if (page === 'drive') {
      pageContent = <DriveView />;
    } else {
      pageContent = <Dashboard page={page} device={device} dongleId={dongleId} />;
    }

    return (
      <div className={classes.app}>
        { page === 'stream' ? (
          <BodyTeleop onClose={ this.closeBodyTeleop } />
        ) : (
          <>
            <AppHeader
              drawerIsOpen={ drawerIsOpen }
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
              { pageContent }
            </div>
            <IosPwaPopup />
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
        { deviceDialogs.includes(dialog) && settingsDevice && canManageDevice(settingsDevice, profile) && (
          <DeviceSettingsModal
            key={ dialogDongleId }
            dongleId={ dialogDongleId }
            device={ settingsDevice }
            dialog={ dialog }
            dispatch={ dispatch }
            onClose={ () => dispatch(closeDialog()) }
          />
        ) }
        { api.auth.isAuthenticated() && dialog === 'add-device' && <AddDevice /> }
      </div>
    );
  }
}

const stateToProps = (state) => {
  const { dialog, dialogDongleId, page } = selectUrl(state);
  return {
    zoom: state.zoom,
    pathname: state.router.location.pathname,
    dongleId: state.dongleId,
    devices: state.devices,
    device: state.device,
    page,
    profile: state.profile,
    dialog,
    dialogDongleId,
    settingsDevice: getDeviceFromState(state, dialogDongleId),
  };
};

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
