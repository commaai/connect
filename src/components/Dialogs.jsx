import { connect } from 'react-redux';

import { closeDialog } from '../actions/history';
import { dialogFromUrl } from '../url';
import AddDevice from './Dashboard/AddDevice';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import TimeSelect from './TimeSelect';

const Dialogs = ({ dispatch, settings, addDevice, filter }) => (
  <>
    {settings && <DeviceSettingsModal isOpen dongleId={settings} onClose={() => dispatch(closeDialog('settings'))} />}
    {addDevice && <AddDevice />}
    {filter && <TimeSelect onClose={() => dispatch(closeDialog('filter'))} />}
  </>
);

const stateToProps = (state) => {
  const { search } = state.router.location;
  const settings = dialogFromUrl(search, 'settings');
  const device = state.devices?.find((d) => d.dongle_id === settings)
    || (state.device?.dongle_id === settings ? state.device : null);
  return {
    // same rule as the settings button in DeviceList
    settings: device && (device.is_owner || state.profile?.superuser) ? settings : null,
    addDevice: dialogFromUrl(search, 'add-device') !== null,
    filter: dialogFromUrl(search, 'filter') !== null,
  };
};

export default connect(stateToProps)(Dialogs);
