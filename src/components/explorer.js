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
import AppDrawer from './AppDrawer';

import Timelineworker from '../timeline';
import { selectRange, primeNav } from '../actions';
import { getDongleID, getZoom, getPrimeNav } from '../url';
import ResizeHandler from './ResizeHandler';

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
    float: 'right'
  },
  fabProgress: {
    marginTop: 10,
  },
});

class ExplorerApp extends Component {
  constructor(props) {
    super(props);

    this.state = {
      settingDongle: null,
      drawerIsOpen: false,
      windowWidth: window.innerWidth,
      headerRef: null,
      pairLoading: false,
      pairError: null,
      pairDongleId: null,
    };

    this.handleDrawerStateChanged = this.handleDrawerStateChanged.bind(this);
    this.onResize = this.onResize.bind(this);
    this.updateHeaderRef = this.updateHeaderRef.bind(this);
    this.closePair = this.closePair.bind(this);
  }

  componentWillMount() {
    this.checkProps(this.props);
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
        const json = JSON.parse(resp);
        if (json.dongle_id) {
          await localforage.removeItem('pairToken');
          this.setState({
            pairLoading: false,
            pairError: null,
            pairDongleId: json.dongle_id,
          });

          const device = await DevicesApi.fetchDevice(json.dongle_id);
          Timelineworker.updateDevice(device);
        } else {
          await localforage.removeItem('pairToken');
          this.setState({ pairDongleId: null, pairLoading: false, pairError: `Could not pair: ${resp}` });
        }
      } catch(err) {
        await localforage.removeItem('pairToken');
        this.setState({ pairDongleId: null, pairLoading: false, pairError: `Error: ${err.message}` });
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

  onResize(windowWidth) {
    this.setState({ windowWidth });
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
    const { drawerIsOpen, pairLoading, pairError, pairDongleId } = this.state;

    const isLarge = this.state.windowWidth > 1080;

    const sidebarWidth = Math.max(280, this.state.windowWidth * 0.2);

    const headerHeight = this.state.headerRef ? this.state.headerRef.getBoundingClientRect().height : 66;
    let containerStyles = {
      minHeight: `calc(100vh - ${headerHeight}px)`,
    };
    if (isLarge) {
      containerStyles = {
        ...containerStyles,
        width: `calc(100% - ${sidebarWidth}px)`,
        marginLeft: sidebarWidth
      };
    }

    let drawerStyles = {
      minHeight: `calc(100vh - ${headerHeight}px)`,
    };

    return (
      <div className={classes.base}>
        <ResizeHandler onResize={ this.onResize } />
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
            { pairDongleId && <Typography>Successfully paired device { pairDongleId }</Typography> }
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
