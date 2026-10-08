import { connect } from 'react-redux';
import { Button, Dialog, DialogActions, DialogTitle } from '@material-ui/core';
import { closeModal, openModal } from '../actions/navigation';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import AddDevice from './Dashboard/AddDevice';
import UploadQueue from './Files/UploadQueue';
import TimeSelect from './TimeSelect';
import ClipMenu from './DriveView/ClipMenu';
import { deviceIsOnline } from '../utils';

// The shell owns overlays so they also work when the mobile drawer is unmounted.
const NavigationModals = ({ modal, devices, device, currentRoute, routes, zoom, dispatch }) => {
  const onClose = () => dispatch(closeModal());
  const modalDevice = devices?.find((candidate) => candidate.dongle_id === modal?.dongleId)
    || (device?.dongle_id === modal?.dongleId ? device : null);
  const modalRoute = currentRoute?.fullname.split('|')[0] === modalDevice?.dongle_id ? currentRoute : null;
  if (modal?.dongleId && devices && !modalDevice) {
    return (
      <Dialog open onClose={onClose}>
        <DialogTitle>Device unavailable</DialogTitle>
        <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
      </Dialog>
    );
  }
  return (
    <>
      <DeviceSettingsModal
        key={`settings:${modal?.dongleId || 'closed'}`}
        dongleId={['settings', 'uploads'].includes(modal?.name) ? modal.dongleId : null}
        isOpen={modal?.name === 'settings'}
        onClose={onClose}
      />
      {modal?.name === 'clips' && modalDevice && (
        <ClipMenu
          key={`clips:${modalDevice.dongle_id}`}
          open
          dongleId={modalDevice.dongle_id}
          deviceOnline={deviceIsOnline(modalDevice)}
          inventoryOnly={!modalRoute}
          route={modalRoute}
          routes={device?.dongle_id === modalDevice.dongle_id ? routes : null}
          zoom={zoom}
          selectedClip={modal.clip}
          onSelectClip={(filename) => dispatch(openModal('clips', modalDevice.dongle_id, filename))}
          onCloseViewer={onClose}
          onClose={onClose}
        />
      )}
      {modal?.name === 'pair' && <AddDevice onClose={onClose} />}
      {modal?.name === 'filter' && <TimeSelect onClose={onClose} />}
      {modal?.name === 'uploads' && modalDevice && (
        <UploadQueue key={`uploads:${modalDevice.dongle_id}`} open update device={modalDevice} onClose={onClose} />
      )}
    </>
  );
};

export default connect((state) => ({
  modal: state.navigation.modal,
  devices: state.devices,
  device: state.device,
  currentRoute: state.currentRoute,
  routes: state.routes,
  zoom: state.zoom,
}))(NavigationModals);
