import React from 'react';
import { connect } from 'react-redux';

import { closeDialog } from '../../actions';
import DeviceSettingsModal from '../Dashboard/DeviceSettingsModal';
import { AddDeviceDialog } from '../Dashboard/AddDevice';

const SETTINGS_DIALOGS = new Set(['settings', 'unpair', 'uploads']);

const Dialogs = ({ dispatch, place, devices, profile }) => {
  const dongleId = place.device ?? place.dongleId;
  const device = devices?.find((d) => d.dongle_id === dongleId);
  const settingsOpen = SETTINGS_DIALOGS.has(place.dialog) && Boolean(device?.is_owner || profile?.superuser);

  return (
    <>
      <DeviceSettingsModal
        isOpen={settingsOpen}
        dongleId={settingsOpen ? dongleId : null}
        onClose={() => dispatch(closeDialog())}
      />
      {place.dialog === 'add-device' && profile && <AddDeviceDialog />}
    </>
  );
};

const stateToProps = (state) => ({
  place: state.place,
  devices: state.devices,
  profile: state.profile,
});

export default connect(stateToProps)(Dialogs);
