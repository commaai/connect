import { connect } from 'react-redux';

import { closeDialog } from '../actions';
import { selectNav } from '../url';
import AddDevice from './Dashboard/AddDevice';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import TimeSelect from './TimeSelect';

// The dialogs that have a URL (see src/url.js), rendered in one place: each
// one is open exactly while its query parameter is.
const Dialogs = ({ dispatch, dialogs, canOpenSettings }) => {
  const close = (name) => () => dispatch(closeDialog(name));

  return (
    <>
      { canOpenSettings && <DeviceSettingsModal isOpen dongleId={ dialogs.settings } onClose={ close('settings') } /> }
      { dialogs['add-device'] && <AddDevice onClose={ close('add-device') } /> }
      { dialogs.filter && <TimeSelect onClose={ close('filter') } /> }
    </>
  );
};

const stateToProps = (state) => {
  const { dialogs } = selectNav(state);
  // the device list, or the device being viewed (which a superuser may not own)
  const device = state.devices?.find((d) => d.dongle_id === dialogs.settings)
    || (state.device?.dongle_id === dialogs.settings ? state.device : null);
  return {
    dialogs,
    canOpenSettings: Boolean(device && (device.is_owner || state.profile?.superuser)),
  };
};

export default connect(stateToProps)(Dialogs);
