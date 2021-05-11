import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import PropTypes from 'prop-types';

import { withStyles } from '@material-ui/core/styles';
import 'mapbox-gl/src/css/mapbox-gl.css';

import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import Annotations from './Annotations';
import AppDrawer from './AppDrawer';

import Timelineworker from '../timeline';
import { selectRange, primeNav } from '../actions';
import { getDongleID, getZoom, getPrimeNav } from '../url';

let resizeTimeout = null;

const styles = (/* theme */) => ({
  base: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'flex',
    height: 64,
    minHeight: 64,
  },
  window: {
    display: 'flex',
    flexGrow: 1,
    minHeight: 0,
    height: '100%',
  },
});

class ExplorerApp extends Component {
  constructor(props) {
    super(props);

    this.state = {
      settingDongle: null,
      drawerIsOpen: false,
      windowHeight: window.innerHeight,
      windowWidth: window.innerWidth,
    };

    this.handleDrawerStateChanged = this.handleDrawerStateChanged.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  componentWillMount() {
    this.checkProps(this.props);
    window.addEventListener('resize', this.handleResize);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
  }

  componentWillReceiveProps(props) {
    this.checkProps(props);

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

  handleResize() {
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeTimeout = setTimeout(() => {
      this.setState({
        windowHeight: window.innerHeight,
        windowWidth: window.innerWidth,
      });
      resizeTimeout = null;
    }, 150);
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

  render() {
    const { classes, expanded } = this.props;

    const showMenuButton = this.state.windowWidth <= 1080;
    const drawerIsPermanent = !expanded && this.state.windowWidth > 1080;
    const sidebarWidth = Math.max(280, this.state.windowWidth * 0.2);

    let containerStyles = {
      height: '100%',
    };
    if (drawerIsPermanent) {
      containerStyles = {
        ...containerStyles,
        width: `calc(100% - ${sidebarWidth}px)`,
        marginLeft: sidebarWidth
      };
    }

    return (
      <div className={classes.base}>
        <div className={classes.header}>
          <AppHeader drawerIsOpen={this.state.drawerIsOpen} showMenuButton={ showMenuButton }
            handleDrawerStateChanged={this.handleDrawerStateChanged}
          />
        </div>
        { (!expanded || !drawerIsPermanent) &&
          <AppDrawer drawerIsOpen={this.state.drawerIsOpen} isPermanent={drawerIsPermanent}
            handleDrawerStateChanged={this.handleDrawerStateChanged} width={ sidebarWidth } />
        }
        <div className={classes.window} style={ containerStyles }>
          { expanded ? (<Annotations />) : (<Dashboard />) }
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
