import React from 'react';
import { connect } from 'react-redux';
import { push } from 'connected-react-router';
import { settingsDevice, settingsLocation } from '../../url';
import DeviceSettingsModal from './DeviceSettingsModal';

// Outside the drawer: a cold settings URL works even when the mobile drawer is closed.
export function UrlSettings({ location, devices, device: currentDevice, profile, dispatch }) {
  const dongleId = settingsDevice(location);
  const device = devices?.find((candidate) => candidate.dongle_id === dongleId)
    || (currentDevice?.dongle_id === dongleId ? currentDevice : null);
  if (!device || (!device.is_owner && !profile?.superuser)) return null;
  return <DeviceSettingsModal isOpen dongleId={dongleId}
    onClose={() => dispatch((nextDispatch, getState) => {
      const current = getState().router.location;
      // A settings action may already have navigated to Prime; never restore a stale page.
      if (settingsDevice(current) === dongleId) nextDispatch(push(settingsLocation(current, null)));
    })} />;
}

export default connect((state) => ({
  location: state.router.location, devices: state.devices, device: state.device, profile: state.profile,
}))(UrlSettings);
