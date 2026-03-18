import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { withStyles, Typography, IconButton, Collapse } from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import CloseIcon from '@material-ui/icons/Close';

import MyCommaAuth from '@commaai/my-comma-auth';
import { devices as Devices } from '@commaai/api';

import { updateDevices } from '../../actions';
import Colors from '../../colors';
import { deviceNamePretty, deviceIsOnline, filterRegularClick, emptyDevice } from '../../utils';
import VisibilityHandler from '../VisibilityHandler';

import AddDevice from './AddDevice';
import DeviceSettingsModal from './DeviceSettingsModal';

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
    },
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
    color: '#74838e',
  },
  editDeviceIcon: {
    color: 'white',
    '&:hover': {
      color: theme.palette.grey[100],
    },
  },
  nameField: {
    marginRight: theme.spacing.unit,
  },
  saveButton: {
    marginRight: theme.spacing.unit,
  },
  textField: {
    marginBottom: theme.spacing.unit,
  },
  addDeviceContainer: {
    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  },
  recentHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 32px 4px',
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.15)' },
  },
  recentHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  recentLabel: {
    color: Colors.white50,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  recentExpandIcon: {
    color: Colors.white30,
    fontSize: 18,
  },
  recentItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 32px 10px 48px',
    cursor: 'pointer',
    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  },
  recentAddress: {
    color: Colors.white70,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  recentRemoveButton: {
    padding: 4,
    color: Colors.white30,
    '&:hover': { color: Colors.white },
  },
  recentRemoveIcon: {
    fontSize: 16,
  },
});

class DeviceList extends Component {
  constructor(props) {
    super(props);

    this.state = {
      settingsModalDongleId: null,
      recentExpanded: false,
      recentConnections: AddDevice.getRecentBodyConnections(),
    };

    this.renderDevice = this.renderDevice.bind(this);
    this.handleOpenedSettingsModal = this.handleOpenedSettingsModal.bind(this);
    this.handleClosedSettingsModal = this.handleClosedSettingsModal.bind(this);
    this.onVisible = this.onVisible.bind(this);
    this.toggleRecent = this.toggleRecent.bind(this);
    this.handleRecentConnect = this.handleRecentConnect.bind(this);
    this.handleRecentRemove = this.handleRecentRemove.bind(this);
  }

  toggleRecent() {
    this.setState((prev) => ({ recentExpanded: !prev.recentExpanded }));
  }

  handleRecentConnect(address) {
    AddDevice.saveRecentBodyConnection(address);
    this.setState({ recentConnections: AddDevice.getRecentBodyConnections() });
    if (this.props.onBodyTeleop) {
      this.props.onBodyTeleop(address);
    }
  }

  handleRecentRemove(address, ev) {
    ev.stopPropagation();
    AddDevice.removeRecentBodyConnection(address);
    this.setState({ recentConnections: AddDevice.getRecentBodyConnections() });
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
    const { dispatch } = this.props;
    this.setState({ recentConnections: AddDevice.getRecentBodyConnections() });
    if (MyCommaAuth.isAuthenticated()) {
      try {
        const devices = await Devices.listDevices();
        dispatch(updateDevices(devices));
      } catch (err) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'devicelist_visible_listdevices' });
      }
    }
  }

  renderDevice(device) {
    const { classes, handleDeviceSelected, profile, selectedDevice } = this.props;
    const isSelectedCls = (selectedDevice === device.dongle_id) ? 'isSelected' : '';
    const offlineCls = !deviceIsOnline(device) ? classes.deviceOffline : '';
    return (
      <a
        key={device.dongle_id}
        className={ `${classes.device} ${isSelectedCls}` }
        onClick={ filterRegularClick(() => handleDeviceSelected(device.dongle_id)) }
        href={ `/${device.dongle_id}` }
      >
        <div className={classes.deviceInfo}>
          <div className={ `${classes.deviceOnline} ${offlineCls}` }>&nbsp;</div>
          <div className={ classes.deviceName }>
            <Typography className={classes.deviceAlias}>
              {deviceNamePretty(device)}
            </Typography>
            <Typography variant="caption" className={classes.deviceId}>
              { device.dongle_id }
            </Typography>
          </div>
        </div>
        { (device.is_owner || (profile && profile.superuser))
          && (
          <IconButton
            className={classes.settingsButton}
            aria-label="device settings"
            onClick={ (ev) => this.handleOpenedSettingsModal(device.dongle_id, ev) }
          >
            <SettingsIcon className={classes.settingsButtonIcon} />
          </IconButton>
          )}
      </a>
    );
  }

  render() {
    const { settingsModalDongleId, recentExpanded, recentConnections } = this.state;
    const { classes, device, selectedDevice: dongleId } = this.props;

    let { devices } = this.props;
    if (devices === null) {
      return null;
    }

    const found = devices.some((d) => d.dongle_id === dongleId);
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
        <div
          className={`scrollstyle ${classes.deviceList}`}
          style={{ height: 'calc(100vh - 64px)' }}
        >
          {devices.map(this.renderDevice)}
          {MyCommaAuth.isAuthenticated() && (
            <div className={classes.addDeviceContainer}>
              <AddDevice buttonText="add new device" buttonStyle={addButtonStyle} buttonIcon onBodyTeleop={this.props.onBodyTeleop} />
            </div>
          )}
          {recentConnections.length > 0 && (
            <>
              <div className={classes.recentHeader} onClick={this.toggleRecent}>
                <div className={classes.recentHeaderLeft}>
                  <Typography className={classes.recentLabel}>Recent bodies</Typography>
                  {recentExpanded
                    ? <ExpandLessIcon className={classes.recentExpandIcon} />
                    : <ExpandMoreIcon className={classes.recentExpandIcon} />}
                </div>
              </div>
              <Collapse in={recentExpanded}>
                {recentConnections.map((address) => (
                  <div
                    key={address}
                    className={classes.recentItem}
                    onClick={() => this.handleRecentConnect(address)}
                  >
                    <Typography className={classes.recentAddress}>{address}</Typography>
                    <IconButton
                      className={classes.recentRemoveButton}
                      onClick={(ev) => this.handleRecentRemove(address, ev)}
                    >
                      <CloseIcon className={classes.recentRemoveIcon} />
                    </IconButton>
                  </div>
                ))}
              </Collapse>
            </>
          )}
        </div>
        <DeviceSettingsModal
          isOpen={Boolean(settingsModalDongleId)}
          dongleId={settingsModalDongleId}
          onClose={this.handleClosedSettingsModal}
        />
      </>
    );
  }
}

const stateToProps = Obstruction({
  devices: 'devices',
  device: 'device',
  profile: 'profile',
});

export default connect(stateToProps)(withStyles(styles)(DeviceList));
