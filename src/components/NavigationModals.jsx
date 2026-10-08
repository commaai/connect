import { connect } from 'react-redux';
import { navigationForState } from '../url';
import { setModal } from '../actions';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import { PairDevice } from './Dashboard/AddDevice';
import UploadQueue from './Files/UploadQueue';
import TimeSelect from './TimeSelect';
import ClipMenu from './DriveView/ClipMenu';
import { deviceIsOnline } from '../utils';

// One modal host preserves the background's component tree and mounts exactly
// one pairing scanner, irrespective of how many "add device" buttons exist.
const NavigationModals = ({ dispatch, navigation, dongleId, device, currentRoute, routes, zoom }) => {
  const close = () => dispatch(setModal(null));
  return (
    <>
      <DeviceSettingsModal isOpen={Boolean(dongleId && navigation.modal === 'settings')} dongleId={dongleId} onClose={close} />
      <PairDevice open={navigation.modal === 'pair'} />
      {device && <UploadQueue open={navigation.modal === 'uploads'} update={navigation.modal === 'uploads'} device={device} onClose={close} />}
      {dongleId && navigation.modal === 'filter' && <TimeSelect onClose={close} />}
      <ClipMenu
        open={Boolean(dongleId && navigation.modal === 'clips')} onClose={close} dongleId={dongleId}
        inventoryOnly={navigation.page !== 'drive'} route={currentRoute} routes={routes} zoom={zoom}
        deviceOnline={deviceIsOnline(device)}
      />
    </>
  );
};

export default connect((state) => ({
  navigation: navigationForState(state), dongleId: state.dongleId, device: state.device,
  currentRoute: state.currentRoute, routes: state.routes, zoom: state.zoom,
}))(NavigationModals);
