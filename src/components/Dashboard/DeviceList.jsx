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
  recentContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    zIndex: 10,
    pointerEvents: 'none',
  },
  recentInner: {
    pointerEvents: 'auto',
    background: Colors.grey950 || '#0c0c0c',
    borderTop: `1px solid ${Colors.white10}`,
  },
  recentHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 32px',
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  },
  recentHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  recentLabel: {
    color: Colors.white70,
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  recentExpandIcon: {
    color: Colors.white50,
    fontSize: 20,
  },
  recentList: {
    maxHeight: 200,
    overflowY: 'auto',
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

    const hasRecent = recentConnections.length > 0;

    return (
      <>
        <VisibilityHandler onVisible={ this.onVisible } minInterval={ 10 } />
        <div style={{ position: 'relative', height: 'calc(100vh - 64px)' }}>
          <div
            className={`scrollstyle ${classes.deviceList}`}
            style={{ height: '100%' }}
          >
            {devices.map(this.renderDevice)}
            {MyCommaAuth.isAuthenticated() && (
              <div className={classes.addDeviceContainer}>
                <AddDevice buttonText="add new device" buttonStyle={addButtonStyle} buttonIcon onBodyTeleop={this.props.onBodyTeleop} />
              </div>
            )}
            {/* spacer so content isn't hidden behind pinned recent section */}
            {hasRecent && <div style={{ height: 48 }} />}
          </div>
          {hasRecent && (
            <div className={classes.recentContainer}>
              <div className={classes.recentInner}>
                <Collapse in={recentExpanded}>
                  <div className={`scrollstyle ${classes.recentList}`}>
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
                  </div>
                </Collapse>
                <div className={classes.recentHeader} onClick={this.toggleRecent}>
                  <div className={classes.recentHeaderLeft}>
                    <Typography className={classes.recentLabel}>Recent body(s) connected to</Typography>
                  </div>
                  {recentExpanded
                    ? <ExpandMoreIcon className={classes.recentExpandIcon} />
                    : <ExpandLessIcon className={classes.recentExpandIcon} />}
                </div>
              </div>
            </div>
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
