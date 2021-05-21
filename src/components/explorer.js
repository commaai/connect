import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import PropTypes from 'prop-types';

import { withStyles } from '@material-ui/core/styles';
import 'mapbox-gl/src/css/mapbox-gl.css';

import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import DriveView from './DriveView';
import AppDrawer from './AppDrawer';

import Timelineworker from '../timeline';
import { selectRange, primeNav } from '../actions';
import { getDongleID, getZoom, getPrimeNav } from '../url';
import ResizeHandler from './ResizeHandler';

const styles = (/* theme */) => ({
  base: {
  },
  window: {
    background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
    display: 'flex',
    flexDirection: 'column',
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
    };

    this.handleDrawerStateChanged = this.handleDrawerStateChanged.bind(this);
    this.onResize = this.onResize.bind(this);
    this.updateHeaderRef = this.updateHeaderRef.bind(this);
  }

  componentWillMount() {
    this.checkProps(this.props);
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
    const { drawerIsOpen } = this.state;

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
