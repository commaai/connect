import { connect } from 'react-redux';
import { api } from '../api/backend';
import { modalNav } from '../actions';
import { parseLocation } from '../url';
import AddDevice from './Dashboard/AddDevice';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import UploadQueue from './Files/UploadQueue';
import TimeSelect from './TimeSelect';

const UrlModals = ({ location, device, profile, dispatch }) => {
  const close = () => dispatch(modalNav(null));
  const canManage = device && (device.is_owner || profile?.superuser);

  if (location.modal === 'pair' && api.auth.isAuthenticated()) {
    return <AddDevice dialogOnly />;
  }
  if (['settings', 'unpair'].includes(location.modal) && canManage) {
    return <DeviceSettingsModal key={device.dongle_id} dongleId={device.dongle_id}
      isOpen={location.modal === 'settings'} unpairOpen={location.modal === 'unpair'} onClose={close} />;
  }
  const showUploads = location.modal === 'uploads';
  const showDriveFiles = location.page === 'drive' && ['files', 'info'].includes(location.modal);
  if ((showUploads || showDriveFiles) && device && api.auth.isAuthenticated()) {
    return <UploadQueue key={device.dongle_id} open={showUploads} update device={device} onClose={close} />;
  }
  if (location.modal === 'filter' && location.page === 'dashboard') {
    return <TimeSelect onClose={close} />;
  }
  return null;
};

export default connect((state) => {
  const location = parseLocation(state.router.location);
  const dongleId = ['settings', 'unpair', 'uploads'].includes(location.modal)
    ? location.modalDevice || state.dongleId : state.dongleId;
  return {
    location,
    profile: state.profile,
    device: state.devices?.find((device) => device.dongle_id === dongleId)
      || (state.device?.dongle_id === dongleId ? state.device : null),
  };
})(UrlModals);
