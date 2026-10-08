import React, { Component } from 'react';
import { connect } from 'react-redux';
import localforage from 'localforage';

import { withStyles, Button, CircularProgress, Modal, Paper, Typography } from '@material-ui/core';
import 'mapbox-gl/src/css/mapbox-gl.css';

import { api } from '../api/backend';

import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import IosPwaPopup from './IosPwaPopup';
import AppDrawer from './AppDrawer';
import BodyTeleop from './BodyTeleop';

import { analyticsEvent, updateDevices } from '../actions';
import { VIEWS } from '../routing/codec';
import { leavePage, toDashboard } from '../routing/navigate';
import { selectView } from '../routing/selectors';
import Colors from '../colors';
import { play, pause } from '../timeline/playback';
import { verifyPairToken, pairErrorToMessage } from '../utils';
import { subscribeWindowSize } from '../hooks/window';

import DriveView from './DriveView';
import NoDeviceUpsell from './DriveView/NoDeviceUpsell';
import Referrals from './Referrals';
import PageNotFound from './PageNotFound';

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

export class ExplorerApp extends Component {
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
    this.props.dispatch(leavePage(this.props.dongleId));
  }

  async componentDidMount() {
    this.unsubscribeWindowSize = subscribeWindowSize(({ width }) => {
      this.setState({ windowWidth: width });
    });

    window.scrollTo({ top: 0 }); // for ios header

    // e.g. start playback when the page opened on a drive selection
    this.componentDidUpdate({ pairRequests: this.props.pairRequests });

    // a token stored before a login redirect, or one that arrives by URL later
    await this.pairFromStoredToken();
  }

  async pairFromStoredToken() {
    let pairToken;
    try {
      pairToken = await localforage.getItem('pairToken');
    } catch (err) {
      console.error(err);
    }
    const { pairLoading, pairError, pairDongleId } = this.state;
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
  }

  componentWillUnmount() {
    this.unsubscribeWindowSize?.();
  }

  componentDidUpdate(prevProps) {
    const { pathname, zoom, pairRequests } = this.props;

    if (prevProps.pairRequests !== pairRequests) {
      this.pairFromStoredToken();
    }

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
      this.props.dispatch(toDashboard(pairDongleId));
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

  renderPage(view, noDevicesUpsell, profile, dongleId, dispatch) {
    switch (view) {
      case VIEWS.REFERRALS:
        return <Referrals profile={profile} onBack={() => dispatch(leavePage(dongleId))} />;
      case VIEWS.INVALID:
        return <PageNotFound dongleId={dongleId} onHome={() => dispatch(toDashboard(dongleId))} />;
      case VIEWS.DRIVE:
        return <DriveView />;
      default:
        // dashboard, prime (rendered inside the dashboard), root and legacy
        // ranges while they resolve
        return noDevicesUpsell ? <NoDeviceUpsell /> : <Dashboard />;
    }
  }

  render() {
    const {
      classes, currentRoute, devices, dispatch, dongleId, view, profile,
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

    return (
      <div className={classes.app}>
        { view === VIEWS.STREAM ? (
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
              { this.renderPage(view, noDevicesUpsell, profile, dongleId, dispatch) }
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
  view: selectView(state),
  pairRequests: state.pairRequests,
  profile: state.profile,
});

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
