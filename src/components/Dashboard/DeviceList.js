import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { devices as DevicesApi } from '@commaai/comma-api';
import { withStyles, Typography, IconButton } from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';
import DeviceSettingsModal from './DeviceSettingsModal';
import { deviceTypePretty, deviceIsOnline } from '../../utils'
import Colors from '../../colors';
import VisibilityHandler from '../VisibilityHandler';
import Timelineworker from '../../timeline';
import AddDevice from './AddDevice';

const styles = (theme) => ({
  deviceList: {
    overflow: 'auto',
  },
  device: {
    alignItems: 'center',
    cursor: 'pointer',
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
});

class DeviceList extends Component {
  constructor(props) {
    super(props);

    this.state = {
      showDeviceSettingsModal: false,
      deviceSettingsModalDevice: null,
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

  handleOpenedSettingsModal(device, ev) {
    ev.stopPropagation();
    ev.preventDefault();
    this.setState({ showDeviceSettingsModal: true, deviceSettingsModalDevice: device });
  }

  handleClosedSettingsModal() {
    this.setState({ showDeviceSettingsModal: false });
  }

  async onVisible() {
    try {
      const devices = await DevicesApi.listDevices();
      Timelineworker.updateDevices(devices);
    } catch (err) {
      console.log(err);
    }
  }

  render() {
    let { classes, devices } = this.props;
    const dongleId = this.props.selectedDevice;
    let found = devices.some((device) => device.dongle_id === dongleId);

    if (!found && dongleId) {
      devices = [{
        dongle_id: dongleId,
        shared: true,
        alias: 'Shared device',
      }].concat(devices);
    }

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
          style={{ height: `calc(100vh - ${this.props.headerHeight}px)` }}>
          { devices.filter(this.filterDrivingDevice).map(this.renderDevice) }
          <div className={ classes.addDeviceContainer }>
            <AddDevice buttonText={ 'add new device' } buttonStyle={ addButtonStyle } buttonIcon={ true } />
          </div>
        </div>
        <DeviceSettingsModal isOpen={this.state.showDeviceSettingsModal} device={ this.state.deviceSettingsModalDevice }
          onClose={this.handleClosedSettingsModal} />
      </>
    );
  }

  renderDevice(device) {
    const { classes, isSuperUser } = this.props;
    const isSelectedCls = (this.props.selectedDevice === device.dongle_id) ? 'isSelected' : '';
    const alias = device.alias || deviceTypePretty(device.device_type);
    const offlineCls = !deviceIsOnline(device) ? classes.deviceOffline : '';
    return (
      <div key={device.dongle_id} onClick={ () => this.props.handleDeviceSelected(device.dongle_id) }
        className={ `${classes.device} ${isSelectedCls}` }>
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
        { ((!device.shared && device.is_owner) || isSuperUser) &&
          <IconButton className={classes.settingsButton} onClick={ (ev) => this.handleOpenedSettingsModal(device, ev) }
            aria-label="device settings">
            <SettingsIcon className={classes.settingsButtonIcon} />
          </IconButton>
        }
      </div>
    );
  }

  filterDrivingDevice(device) {
    return device.device_type !== 'panda';
  }
}

const stateToProps = Obstruction({
  devices: 'workerState.devices',
  isSuperUser: 'workerState.profile.superuser',
});

export default connect(stateToProps)(withStyles(styles)(DeviceList));
