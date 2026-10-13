import { connect } from 'react-redux';
import { Button, Modal, Paper, Typography } from '@material-ui/core';
import { closeDialog } from '../actions';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import AddDevice from './Dashboard/AddDevice';
import TimeSelect from './TimeSelect';

// Global dialogs must remain mounted independently of the mobile drawer and page.
const NavigationDialogs = ({ navigation, devices, profile, dispatch }) => {
  const { dialog, dialogDevice } = navigation;
  const close = () => dispatch(closeDialog());
  if (dialog === 'filter') return <TimeSelect onClose={close} />;
  if (dialog === 'pair' && profile) return <AddDevice dialogOnly />;
  if (['settings', 'settings-uploads', 'unpair'].includes(dialog)) {
    const device = devices?.find((candidate) => candidate.dongle_id === dialogDevice);
    if (device && (device.is_owner || profile?.superuser)) {
      return <DeviceSettingsModal key={dialogDevice} dongleId={dialogDevice} isOpen onClose={close} />;
    }
  } else if (dialog !== 'pair') {
    return null;
  }
  return (
    <Modal open onClose={close}>
      <Paper className="absolute left-1/2 top-[40%] w-[400px] max-w-[90%] -translate-x-1/2 -translate-y-1/2 p-4">
        <Typography>{devices === null ? 'Loading...' : 'This dialog is unavailable for this account.'}</Typography>
        <Button onClick={close}>Close</Button>
      </Paper>
    </Modal>
  );
};

export default connect((state) => ({
  navigation: state.navigation, devices: state.devices, profile: state.profile,
}))(NavigationDialogs);
