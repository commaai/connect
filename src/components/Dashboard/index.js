import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';

import DriveList from './DriveList';
import Prime from '../Prime';
import PrimeBanner from '../Prime/PrimeBanner';
import Navigation from '../Navigation';
import DeviceInfo from '../DeviceInfo';

const styles = (/* theme */) => ({
  base: {
    display: 'flex',
    flexDirection: 'column',
  },
});

class Dashboard extends Component {
  constructor(props) {
    super(props);

    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.fetchDeviceOnline = this.fetchDeviceOnline.bind(this);
    this.fetchDeviceOnlineTimeout = null;
  }

  componentDidMount() {
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.componentDidUpdate({});
  }

  componentDidUpdate(prevProps) {
    if (prevProps.dongleId !== this.props.dongleId && this.props.dongleId) {
      if (this.fetchDeviceOnlineTimeout) {
        clearTimeout(this.fetchDeviceOnlineTimeout);
        this.fetchDeviceOnlineTimeout = null;
      }
      this.fetchDeviceOnline();
    }
  }

  componentWillUnmount() {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.fetchDeviceOnlineTimeout) {
      clearTimeout(this.fetchDeviceOnlineTimeout);
      this.fetchDeviceOnlineTimeout = null;
    }
  }

  onVisibilityChange(ev) {
    if (document.visibilityState === 'visible' && !this.fetchDeviceOnlineTimeout) {
      this.fetchDeviceOnline();
    }
  }

  fetchDeviceOnline() {
    if (document.visibilityState === 'visible') {
      this.fetchDeviceOnlineTimeout = setTimeout(this.fetchDeviceOnline, 1000);
    } else {
      this.fetchDeviceOnlineTimeout = null;
    }

    console.log(new Date().getTime() / 1000, 'fetching');
  }

  render() {
    const { classes, primeNav, device, dongleId } = this.props;

    if (!device || !dongleId) {
      return null;
    }

    return (
      <div className={classes.base}>
        { primeNav ?
          <Prime /> :
          <>
            <Navigation hasNav={ device.prime && device.device_type === 'three' } />
            { !device.prime && device.is_owner && <PrimeBanner collapsed /> }
            <DeviceInfo />
            <DriveList />
          </>
        }
      </div>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  dongleId: 'workerState.dongleId',
  primeNav: 'workerState.primeNav',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));
