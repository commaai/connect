import { connect } from 'react-redux';
import { Button, Modal, Paper, Typography } from '@material-ui/core';

import { api } from '../api/backend';
import { closeModal } from '../actions/navigation';
import { selectLocation } from '../url';
import { AddDeviceModal } from './Dashboard/AddDevice';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';

// These dialogs live outside the sidebar so direct links work even when the
// mobile drawer is closed, and pairing has exactly one camera owner.
const RoutedModals = ({ route, devices, device, profile, dispatch }) => {
  if (route.modal === 'add-device') {
    return api.auth.isAuthenticated() ? <AddDeviceModal /> : null;
  }
  if (!route.modal?.startsWith('settings')) return null;

  const dongleId = route.modalDongleId;
  const settingsDevice = devices?.find((candidate) => candidate.dongle_id === dongleId)
    || (device?.dongle_id === dongleId ? device : null);
  const onClose = () => dispatch(closeModal());

  if (settingsDevice && (settingsDevice.is_owner || profile?.superuser)) {
    return <DeviceSettingsModal key={dongleId} isOpen dongleId={dongleId} modal={route.modal} onClose={onClose} />;
  }

  return (
    <Modal open onClose={onClose} className="flex items-center justify-center">
      <Paper className="p-4 outline-none max-w-[90%]">
        <Typography>{devices === null ? 'Loading device settings…' : 'You do not have access to these device settings.'}</Typography>
        <Button onClick={onClose}>Close</Button>
      </Paper>
    </Modal>
  );
};

export default connect((state) => ({
  route: selectLocation(state),
  devices: state.devices,
  device: state.device,
  profile: state.profile,
}))(RoutedModals);
