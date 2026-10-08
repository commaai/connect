import React from 'react';
import { connect } from 'react-redux';
import { currentView } from '../url';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import AddDevice from './Dashboard/AddDevice';
import TimeSelect from './TimeSelect';
import { closeDialog } from '../actions/navigation';

function Dialogs({ dispatch, view, devices, profile }) {
  const settings = ['settings', 'unpair', 'settings-uploads'].includes(view.dialog);
  const device = settings
    ? devices?.find((candidate) => candidate.dongle_id === view.dialogDevice)
    : null;
  const canConfigure = device && (device.is_owner || profile?.superuser);

  return (
    <>
      {settings && canConfigure && (
        <DeviceSettingsModal
          isOpen={view.dialog === 'settings'}
          dongleId={view.dialogDevice}
          onClose={() => dispatch(closeDialog())}
        />
      )}
      {view.dialog === 'add-device' && <AddDevice modalOnly open onClose={() => dispatch(closeDialog())} />}
      {view.dialog === 'filter' && <TimeSelect onClose={() => dispatch(closeDialog())} />}
    </>
  );
}

const stateToProps = (state) => ({
  view: currentView(state),
  devices: state.devices,
  profile: state.profile,
});

export default connect(stateToProps)(Dialogs);
