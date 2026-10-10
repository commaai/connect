import { connect } from 'react-redux';
import { selectLocation } from '../../url';
import { closeDialog } from '../../actions/history';
import AddDevice from '../Dashboard/AddDevice';
import DeviceSettingsModal from '../Dashboard/DeviceSettingsModal';
import TimeSelect from '../TimeSelect';

const Dialogs = ({ destination, device, profile, dispatch }) => {
  const { dialog, dialogDeviceId, parent } = destination;
  const canManage = device && (device.is_owner || profile?.superuser);
  const settingsDialog = ['settings', 'unpair', 'uploads'].includes(dialog)
    && (dialog !== 'uploads' || destination.page !== 'drive' || parent === 'settings' || dialogDeviceId !== destination.dongleId);
  return (
    <>
      {dialog === 'add-device' && <AddDevice modalOnly />}
      {dialog === 'filter' && <TimeSelect onClose={() => dispatch(closeDialog())} />}
      {settingsDialog && canManage && <DeviceSettingsModal
        isOpen={dialog === 'settings'}
        dialog={dialog}
        dongleId={dialogDeviceId}
        onClose={() => dispatch(closeDialog())}
      />}
    </>
  );
};

export default connect((state) => {
  const destination = selectLocation(state);
  const dongleId = destination.dialogDeviceId || state.dongleId;
  return {
    destination: { ...destination, dialogDeviceId: dongleId },
    device: state.devices?.find((candidate) => candidate.dongle_id === dongleId)
      || (state.device?.dongle_id === dongleId ? state.device : null),
    profile: state.profile,
  };
})(Dialogs);
