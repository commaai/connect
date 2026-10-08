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

import { analyticsEvent, selectDevice, updateDevices, checkLastRoutesData, streamNav } from '../actions';
import init from '../actions/startup';
import Colors from '../colors';
import { play, pause } from '../timeline/playback';
import { verifyPairToken, pairErrorToMessage } from '../utils';
import { subscribeWindowSize } from '../hooks/window';

import DriveView from './DriveView';
import NoDeviceUpsell from './DriveView/NoDeviceUpsell';
import Referrals from './Referrals';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import { buildUrl, parseUrl, ROUTES } from '../url';

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

    // The url settings was opened from, so closing it returns there instead of
    // guessing. Null until a settings page is entered from another one.
    this.settingsReturnUrl = null;
    this.settingsKey = null;

    this.handleDrawerStateChanged = this.handleDrawerStateChanged.bind(this);
    this.updateHeaderRef = this.updateHeaderRef.bind(this);
    this.closePair = this.closePair.bind(this);
    this.closeSettings = this.closeSettings.bind(this);
    this.closeBodyTeleop = this.closeBodyTeleop.bind(this);
  }

  // `/<dongleId>/settings` is a page of its own, so this is a pure read of the
  // url: the device whose settings are open, or null when they are closed.
  get settingsTarget() {
    const loc = parseUrl(this.props.pathname);
    return loc.page === ROUTES.SETTINGS ? loc.dongleId : null;
  }

  closeSettings() {
    const { dispatch, dongleId, currentRoute, selectedRouteId } = this.props;
    const routeId = currentRoute?.log_id || selectedRouteId || null;
    // Return to the url settings was opened from so its device, route and
    // playback range all survive the round trip. A settings url that was typed
    // or shared has no such url, so fall back to whatever is open now.
    dispatch(push(this.settingsReturnUrl || (routeId
      ? buildUrl({ page: ROUTES.DRIVE, dongleId, routeId })
      : buildUrl({ dongleId }))));
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

    const q = new URLSearchParams(window.location.search);
    if (q.has('r')) {
      this.props.dispatch(replace(q.get('r')));
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

  componentDidUpdate(prevProps, prevState) {
    const { pathname, zoom, dongleId, limit, devices, profile, dispatch } = this.props;

    if (prevProps.pathname !== pathname) {
      this.setState({ drawerIsOpen: false });
    }

    // Remember the url we came from the first time a settings page appears, so
    // closing returns to it rather than to a rebuilt guess that drops the range.
    const settingsKey = this.settingsTarget;
    if (settingsKey !== this.settingsKey) {
      this.settingsKey = settingsKey;
      const prev = typeof prevProps.pathname === 'string' ? parseUrl(prevProps.pathname) : null;
      this.settingsReturnUrl = prev && prev.page !== ROUTES.SETTINGS ? buildUrl(prev) : null;
    }

    // Settings are owner-only. `/<dongleId>/settings` for a device you do not own
    // would otherwise render an empty page with no way out of it.
    if (settingsKey && devices) {
      const owner = devices.find((d) => d.dongle_id === settingsKey);
      if (!owner || !(owner.is_owner || profile?.superuser)) {
        dispatch(push(buildUrl({ dongleId: settingsKey })));
      }
    }

    if (!prevProps.zoom && zoom) {
      this.props.dispatch(play());
    }
    if (prevProps.zoom && !zoom) {
      this.props.dispatch(pause());
    }

    // this is necessary when user goes to explorer for the first time, dongleId is not populated in state yet
    // so init() will not successfully fetch routes data
    // when checkLastRoutesData is called within init(), it would set limit so we don't need to check again
    if (prevProps.dongleId !== dongleId && limit === 0) {
      this.props.dispatch(checkLastRoutesData());
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
      classes, currentRoute, devices, dispatch, dongleId, bodyTeleopOpen, selectedRouteId, pathname, profile,
    } = this.props;
    const { drawerIsOpen, pairLoading, pairError, pairDongleId, windowWidth } = this.state;

    const noDevicesUpsell = (devices?.length === 0 && !dongleId);
    const referralsOpen = pathname === '/referrals';
    const settingsDongleId = this.settingsTarget;
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
            { settingsDongleId && (
              <DeviceSettingsModal
                isOpen={ true }
                dongleId={ settingsDongleId }
                onClose={ this.closeSettings }
              />
            )}
          </>
        ) }
      </div>
    );
  }
}

const stateToProps = (state) => ({
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
