import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import PropTypes from 'prop-types';
import localforage from 'localforage';
import * as Sentry from '@sentry/react';

import { withStyles, Modal, Paper, Typography, Button, CircularProgress, Divider } from '@material-ui/core';
import 'mapbox-gl/src/css/mapbox-gl.css';

import { devices as DevicesApi } from '@commaai/comma-api';

import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import DriveView from './DriveView';
import AppDrawer from './AppDrawer';

import Timelineworker from '../timeline';
import { selectRange, primeNav } from '../actions';
import { getDongleID, getZoom, getPrimeNav } from '../url';
import ResizeHandler from './ResizeHandler';
import Colors from '../colors';

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
      settingDongle: null,
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

  componentWillMount() {
    this.checkProps(this.props);
    window.scrollTo({ top: 0 });
  }

  async componentDidMount() {
    const { pairLoading, pairError, pairDongleId } = this.state;
    let pairToken;
    try {
      pairToken = await localforage.getItem('pairToken');
    } catch (err) {
      console.log(err);
    }
    if (pairToken && !pairLoading && !pairError && !pairDongleId) {
      this.setState({ pairLoading: true });
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
          Timelineworker.updateDevice(device);
        } else {
          await localforage.removeItem('pairToken');
          console.log(resp);
          this.setState({ pairDongleId: null, pairLoading: false, pairError: 'Error: could not pair, please try again' });
        }
      } catch(err) {
        await localforage.removeItem('pairToken');
        let msg;
        if (err.message.indexOf('400') === 0) {
          msg = 'invalid request';
        } else if (err.message.indexOf('401') === 0) {
          msg = 'could not decode token';
        } else if (err.message.indexOf('403') === 0) {
          msg = 'device paired with different owner';
        } else if (err.message.indexOf('404') === 0) {
          msg = 'tried to pair invalid device';
        } else if (err.message.indexOf('417') === 0) {
          msg = 'pair token not true';
        } else {
          msg = 'unable to pair';
          console.log(err);
          Sentry.captureException(err);
        }
        this.setState({ pairDongleId: null, pairLoading: false, pairError: `Error: ${msg}, please try again` });
      }
    }
  }

  async closePair() {
    const { pairDongleId } = this.state;
    if (pairDongleId) {
      Timelineworker.selectDevice(pairDongleId);
    }
    await localforage.removeItem('pairToken');
    this.setState({ pairLoading: false, pairError: null, pairDongleId: null });
  }

  componentWillReceiveProps(props) {
    this.checkProps(props);

    if (this.props.pathname !== props.pathname) {
      this.setState({ drawerIsOpen: false });
    }

    const isZoomed = props.expanded;
    const { expanded } = this.props;
    const wasZoomed = expanded;

    if (isZoomed && !wasZoomed) {
      Timelineworker.play();
    }
    if (!isZoomed && wasZoomed) {
      Timelineworker.pause();
    }
  }

  handleDrawerStateChanged(drawerOpen) {
    this.setState({
      drawerIsOpen: drawerOpen
    });
  }

  checkProps(props) {
    const dongleId = getDongleID(props.pathname);
    const zoom = getZoom(props.pathname);

    const { settingDongle } = this.state;
    const curDongle = settingDongle || props.dongleId;
    const { dispatch } = this.props;

    if (dongleId) {
      if (curDongle !== dongleId) {
        if (!settingDongle) {
          Timelineworker.selectDevice(dongleId);
          this.setState({
            settingDongle: dongleId
          });
        }
      } else {
        this.setState({
          settingDongle: null
        });
      }
    }

    if (getPrimeNav(props.pathname)) {
      dispatch(primeNav());
    } else {
      dispatch(selectRange(zoom.start, zoom.end));
    }
  }

  updateHeaderRef(ref) {
    if (!this.state.headerRef) {
      this.setState({ headerRef: ref });
    }
  }

  render() {
    const { classes, expanded } = this.props;
    const { drawerIsOpen, pairLoading, pairError, pairDongleId, windowWidth } = this.state;

    const isLarge = windowWidth > 1080;

    const sidebarWidth = Math.max(280, windowWidth * 0.2);

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
        <AppHeader drawerIsOpen={ drawerIsOpen } annotating={ expanded } showDrawerButton={ !isLarge }
          handleDrawerStateChanged={this.handleDrawerStateChanged} forwardRef={ this.updateHeaderRef } />
        <AppDrawer drawerIsOpen={ drawerIsOpen } isPermanent={ isLarge } width={ sidebarWidth }
          handleDrawerStateChanged={this.handleDrawerStateChanged} style={ drawerStyles } />
        <div className={ classes.window } style={ containerStyles }>
          { expanded ? (<DriveView />) : (<Dashboard />) }
        </div>
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

ExplorerApp.propTypes = {
  expanded: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
  classes: PropTypes.object.isRequired
};

const stateToProps = Obstruction({
  expanded: 'zoom.expanded',
  pathname: 'router.location.pathname',
  dongleId: 'workerState.dongleId',
});

export default connect(stateToProps)(withStyles(styles)(ExplorerApp));
