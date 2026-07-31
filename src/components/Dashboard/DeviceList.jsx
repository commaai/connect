import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { IconButton } from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';

import MyCommaAuth from '@commaai/my-comma-auth';
import { devices as Devices } from '../../api';

import { updateDevices } from '../../actions';
import { deviceNamePretty, deviceIsOnline, filterRegularClick, emptyDevice } from '../../utils';
import VisibilityHandler from '../VisibilityHandler';

import AddDevice from './AddDevice';
import DeviceSettingsModal from './DeviceSettingsModal';

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
    const { handleDeviceSelected, profile, selectedDevice } = this.props;
    const isSelectedCls = (selectedDevice === device.dongle_id) ? 'isSelected' : '';
    const onlineCls = deviceIsOnline(device) ? 'bg-engaged' : 'bg-progress';
    return (
      <a
        key={device.dongle_id}
        className={`flex items-center justify-between px-8 py-4 no-underline [&.isSelected]:bg-scrim/25 ${isSelectedCls}`}
        onClick={ filterRegularClick(() => handleDeviceSelected(device.dongle_id)) }
        href={ `/${device.dongle_id}` }
      >
        <div className="flex items-center">
          <div className={`h-1.5 w-1.5 rounded-[3px] ${onlineCls}`}>&nbsp;</div>
          <div className="ml-4 flex flex-col justify-center">
            <p className="font-semibold">
              {deviceNamePretty(device)}
            </p>
            <span className="type-caption text-content-subtle">
              { device.dongle_id }
            </span>
          </div>
        </div>
        { (device.is_owner || (profile && profile.superuser))
          && (
          <IconButton
            className="h-[46px] w-[46px] text-content/30 transition-colors hover:text-content"
            aria-label="device settings"
            onClick={ (ev) => this.handleOpenedSettingsModal(device.dongle_id, ev) }
          >
            <SettingsIcon />
          </IconButton>
          )}
      </a>
    );
  }

  render() {
    const { settingsModalDongleId } = this.state;
    const { device, selectedDevice: dongleId } = this.props;

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
          className="scrollstyle overflow-auto"
          style={{ height: 'calc(100vh - 64px)' }}
        >
          {devices.map(this.renderDevice)}
          {MyCommaAuth.isAuthenticated() && (
            <div className="hover:bg-scrim/25">
              <AddDevice buttonText="add new device" buttonStyle={addButtonStyle} buttonIcon />
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

export default connect(stateToProps)(DeviceList);
