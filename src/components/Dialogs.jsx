import { connect } from 'react-redux';
import { currentView } from '../url';
import { closeDialog } from '../actions';
import { deviceIsOnline } from '../utils';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import { AddDeviceDialog } from './Dashboard/AddDevice';
import TimeSelect from './TimeSelect';
import UploadQueue from './Files/UploadQueue';
import ClipMenu from './DriveView/ClipMenu';

// Mounted above pages: overlays never unmount the drive or reset its input.
function Dialogs({ view, device, currentRoute, zoom, dispatch, profile, activeDevice, routes }) {
  const close = () => dispatch(closeDialog());
  const settings = ['settings', 'unpair', 'settings-uploads'].includes(view.dialog);
  const authorized = device && (device.is_owner || profile?.superuser);
  const clips = ['clips', 'clip', 'clip-delete'].includes(view.dialog);
  const clipTarget = clips ? device : activeDevice;
  const sameDevice = clipTarget?.dongle_id === activeDevice?.dongle_id;
  const clipLogId = sameDevice && view.page === 'drive' ? view.logId : null;
  const clipRoute = sameDevice ? currentRoute : null;
  return (
    <>
      {settings && authorized && (
        <DeviceSettingsModal
          key={view.dialogDevice}
          dialog={view.dialog}
          dongleId={view.dialogDevice}
          onClose={close}
        />
      )}
      {view.dialog === 'add-device' && <AddDeviceDialog />}
      {view.dialog === 'filter' && <TimeSelect onClose={close} />}
      {device && (view.dialog === 'uploads' || (view.dialog === 'settings-uploads' && authorized)) && (
        <UploadQueue
          key={device.dongle_id}
          open
          update
          device={device}
          onClose={close}
        />
      )}
      {clipTarget && (clipTarget.is_owner || profile?.superuser) && (
        <ClipMenu
          key={`${clipTarget.dongle_id}/${clipLogId || ''}`}
          open={clips}
          dialog={clips ? view.dialog : null}
          clip={clips ? view.clip : null}
          dispatch={dispatch}
          dongleId={clipTarget.dongle_id}
          route={clipRoute}
          routes={sameDevice ? routes : null}
          zoom={clipRoute ? zoom : null}
          deviceOnline={deviceIsOnline(clipTarget)}
          inventoryOnly={!clipRoute}
          onClose={close}
        />
      )}
    </>
  );
}

export default connect((state) => {
  const view = currentView(state);
  const device = state.devices?.find((d) => d.dongle_id === view.dialogDevice)
    || (state.device?.dongle_id === view.dialogDevice ? state.device : null)
    || (!view.dialogDevice ? state.device : null);
  return {
    view,
    device,
    currentRoute: state.currentRoute,
    routes: state.routes,
    zoom: state.zoom,
    profile: state.profile,
    activeDevice: state.device,
  };
})(Dialogs);
