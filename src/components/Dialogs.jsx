import { connect } from 'react-redux';
import { currentView } from '../url';
import { closeDialog } from '../actions/navigation';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import AddDevice from './Dashboard/AddDevice';
import TimeSelect from './TimeSelect';

// Outside the drawer: deep links also work on narrow screens and after reload.
function Dialogs({ dispatch, view, devices, profile }) {
  const settings = ['settings', 'unpair', 'settings-uploads'].includes(view.dialog);
  const device = devices?.find((d) => d.dongle_id === view.dialogDevice);
  const canConfigure = device && (device.is_owner || profile?.superuser);
  return <>
    {settings && canConfigure && <DeviceSettingsModal
      key={view.dialogDevice}
      isOpen
      dongleId={view.dialogDevice}
      onClose={() => dispatch(closeDialog())}
    />}
    {view.dialog === 'add-device' && profile && <AddDevice modalOnly open />}
    {view.dialog === 'filter' && view.dongleId && <TimeSelect onClose={() => dispatch(closeDialog())} />}
  </>;
}

export default connect((state) => ({ view: currentView(state), devices: state.devices, profile: state.profile }))(Dialogs);
