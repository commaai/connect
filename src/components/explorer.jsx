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

import { analyticsEvent, selectDevice, updateDevices, streamNav, fetchSharedDevice } from '../actions';
import { navigate } from '../actions/navigation';
import init from '../actions/startup';
import Colors from '../colors';
import { play, pause } from '../timeline/playback';
import { verifyPairToken, pairErrorToMessage } from '../utils';
import { subscribeWindowSize } from '../hooks/window';

import DriveView from './DriveView';
import NoDeviceUpsell from './DriveView/NoDeviceUpsell';
import Referrals from './Referrals';
import RoutedModals from './RoutedModals';
import { parseLocation, pathForState, safeReturnTo } from '../url';

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

    const q = new URLSearchParams(window.location.search);
    if (q.has('r')) {
      this.props.dispatch(replace(safeReturnTo(q.get('r'))));
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
      classes, devices, dispatch, dongleId, bodyTeleopOpen, page, profile, navigationError, deviceError, pathname, search, location,
    } = this.props;
    const { drawerIsOpen, pairLoading, pairError, pairDongleId, windowWidth } = this.state;

    const noDevicesUpsell = (devices?.length === 0 && !dongleId);
    const referralsOpen = page === 'referrals';
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
        { bodyTeleopOpen && !deviceError ? (
          <BodyTeleop key={dongleId} onClose={ this.closeBodyTeleop } />
        ) : (
          <>
            <AppHeader
              drawerIsOpen={ drawerIsOpen }
              viewingRoute={ page === 'drive' }
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
              { page === 'notFound'
                ? <div className="p-8"><Typography variant="title">Page not found</Typography><Button onClick={() => dispatch(push('/'))}>Go to your devices</Button></div>
                : deviceError
                ? (
                  <div className="p-8">
                    <Typography>{deviceError}</Typography>
                    <Button onClick={() => dispatch(fetchSharedDevice(dongleId))}>Try again</Button>
                    <Button onClick={() => dispatch(navigate('/'))}>Go to your devices</Button>
                  </div>
                )
                : page === 'legacy' || navigationError
                ? (
                  <div className="p-8">
                    <Typography>{navigationError || 'Loading drive…'}</Typography>
                    {navigationError && page === 'drive' && parseLocation(location).zoom && (
                      <Button onClick={() => dispatch(navigate({
                        ...location,
                        pathname: pathForState({ ...parseLocation(location), modal: null, clip: null, zoom: null }),
                        state: { ...location.state, zoomPrevious: null },
                      }, true))}>View full drive</Button>
                    )}
                    {navigationError && <Button href={`${pathname}${search}`}>Try again</Button>}
                    {navigationError && <Button onClick={() => dispatch(selectDevice(dongleId))}>Go to your drives</Button>}
                  </div>
                )
                : referralsOpen
                ? <Referrals profile={profile} onBack={() => dispatch(push(dongleId ? `/${dongleId}` : '/'))} />
                : noDevicesUpsell
                ? <NoDeviceUpsell />
                : (page === 'drive' ? <DriveView /> : <Dashboard key={dongleId} />)}
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
        <RoutedModals />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  location: state.router.location,
  zoom: state.zoom,
  pathname: state.router.location.pathname,
  search: state.router.location.search,
  navigationError: state.navigationError,
  deviceError: ['device', 'prime', 'stream'].includes(parseLocation(state.router.location).page) ? state.deviceError : null,
  dongleId: state.dongleId,
  devices: state.devices,
  bodyTeleopOpen: parseLocation(state.router.location).page === 'stream',
  page: parseLocation(state.router.location).page,
  profile: state.profile,
});

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
