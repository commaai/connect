import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import { withStyles, Typography, IconButton } from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';

import MyCommaAuth from '@commaai/my-comma-auth';
import { devices as DevicesApi } from '@commaai/comma-api';

import DeviceSettingsModal from './DeviceSettingsModal';
import { deviceTypePretty, deviceIsOnline, filterRegularClick, emptyDevice } from '../../utils'
import Colors from '../../colors';
import VisibilityHandler from '../VisibilityHandler';
import { updateDevices } from '../../actions';
import AddDevice from './AddDevice';

const styles = (theme) => ({
  deviceList: {
    overflow: 'auto',
  },
  device: {
    textDecoration: 'none',
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px 32px',
    '&.isSelected': {
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
    }
  },
  settingsButton: {
    height: 46,
    width: 46,
    color: Colors.white30,
    transition: 'color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
    '&:hover': {
      color: Colors.white,
    },
  },
  deviceOnline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.green400,
  },
  deviceOffline: {
    backgroundColor: Colors.grey400,
  },
  deviceInfo: {
    display: 'flex',
    alignItems: 'center',
  },
  deviceName: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    marginLeft: 16,
  },
  deviceAlias: {
    fontWeight: 600,
  },
  deviceId: {
    color: '#525E66',
  },
  editDeviceIcon: {
    color: 'white',
    '&:hover': {
      color: theme.palette.grey[100]
    }
  },
  nameField: {
    marginRight: theme.spacing.unit,
  },
  saveButton: {
    marginRight: theme.spacing.unit,
  },
  textField: {
    marginBottom: theme.spacing.unit
  },
  addDeviceContainer: {
    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  },
  versionNumber: {
    fontSize: 14,
    height: 16,
    color: 'transparent',
    alignSelf: 'flex-end',
  },
});

class DeviceList extends Component {
  constructor(props) {
    super(props);

    this.state = {
      settingsModalDongleId: null,
    };

    this.renderDevice = this.renderDevice.bind(this);
    this.handleOpenedSettingsModal = this.handleOpenedSettingsModal.bind(this);
    this.handleClosedSettingsModal = this.handleClosedSettingsModal.bind(this);
    this.onVisible = this.onVisible.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.selectedDevice !== this.props.selectedDevice
        && nextProps.selectedDevice !== this.state.editingDevice) {
      this.setState({ editingDevice: null });
    }
  }

  handleOpenedSettingsModal(dongleId, ev) {
    ev.stopPropagation();
    ev.preventDefault();
    this.setState({ settingsModalDongleId: dongleId });
  }

  handleClosedSettingsModal() {
    this.setState({ settingsModalDongleId: null });
  }

  async onVisible() {
    if (MyCommaAuth.isAuthenticated()) {
      try {
        const devices = await DevicesApi.listDevices();
        this.props.dispatch(updateDevices(devices));
      } catch (err) {
        Sentry.captureException(err, { fingerprint: 'devicelist_visible_listdevices' });
        console.log(err);
      }
    }
  }

  render() {
    let { classes, device, devices } = this.props;
    const dongleId = this.props.selectedDevice;

    if (devices === null) {
      return null;
    }

    let found = devices.some((device) => device.dongle_id === dongleId);
    if (!found && device && dongleId === device.dongle_id) {
      devices = [{
        ...device,
        alias: emptyDevice.alias,
      }].concat(devices);
    } else if (!found && dongleId) {
      devices = [{
        ...emptyDevice,
        dongle_id: dongleId,
      }].concat(devices);
    }

    const version = process.env.REACT_APP_GIT_SHA ? process.env.REACT_APP_GIT_SHA : 'dev';

    const addButtonStyle = {
      borderRadius: 'unset',
      backgroundColor: 'transparent',
      color: 'white',
      fontWeight: 600,
      justifyContent: 'space-between',
      padding: '16px 44px 16px 54px',
    };

    return (
      <>
        <VisibilityHandler onVisible={ this.onVisible } minInterval={ 10 } />
        <div className={ `scrollstyle ${classes.deviceList}` }
          style={{ height: `calc(100vh - ${this.props.headerHeight + 16}px)` }}>
          { devices.filter(this.filterDrivingDevice).map(this.renderDevice) }
          { MyCommaAuth.isAuthenticated() &&
            <div className={ classes.addDeviceContainer }>
              <AddDevice buttonText={ 'add new device' } buttonStyle={ addButtonStyle } buttonIcon={ true } />
            </div>
          }
        </div>
        <div className={ classes.versionNumber }>{ version }</div>
        <DeviceSettingsModal isOpen={ Boolean(this.state.settingsModalDongleId) }
          dongleId={ this.state.settingsModalDongleId } onClose={this.handleClosedSettingsModal}/>
      </>
    );
  }

  renderDevice(device) {
    const { classes, profile } = this.props;
    const isSelectedCls = (this.props.selectedDevice === device.dongle_id) ? 'isSelected' : '';
    const alias = device.alias || deviceTypePretty(device.device_type);
    const offlineCls = !deviceIsOnline(device) ? classes.deviceOffline : '';
    return (
      <a key={device.dongle_id} className={ `${classes.device} ${isSelectedCls}` }
        onClick={ filterRegularClick(() => this.props.handleDeviceSelected(device.dongle_id)) } href={ `/${device.dongle_id}` }>
        <div className={classes.deviceInfo}>
          <div className={ `${classes.deviceOnline} ${offlineCls}` }>&nbsp;</div>
          <div className={ classes.deviceName }>
            <Typography className={classes.deviceAlias}>
              { alias }
            </Typography>
            <Typography variant="caption" className={classes.deviceId}>
              { device.dongle_id }
            </Typography>
          </div>
        </div>
        { (device.is_owner || (profile && profile.superuser)) &&
          <IconButton className={classes.settingsButton} aria-label="device settings"
            onClick={ (ev) => this.handleOpenedSettingsModal(device.dongle_id, ev) }>
            <SettingsIcon className={classes.settingsButtonIcon} />
          </IconButton>
        }
      </a>
    );
  }

  filterDrivingDevice(device) {
    return device.device_type !== 'panda';
  }
}

const stateToProps = Obstruction({
  devices: 'devices',
  device: 'device',
  profile: 'profile',
});

export default connect(stateToProps)(withStyles(styles)(DeviceList));
