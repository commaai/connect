import { connect } from 'react-redux';

import { closeDialog } from '../../actions/history';
import { Dialog, selectLocation } from '../../url';
import AddDevice from '../Dashboard/AddDevice';
import DeviceSettingsModal from '../Dashboard/DeviceSettingsModal';
import TimeSelect from '../TimeSelect';

// Every dialog that ?dialog=<name> can open, shown on top of whatever page is open.
const Dialogs = ({ dialog, dongleId, dispatch }) => {
  const close = () => dispatch(closeDialog());

  return (
    <>
      <DeviceSettingsModal isOpen={dialog === Dialog.SETTINGS} dongleId={dialog === Dialog.SETTINGS ? dongleId : null} onClose={close} />
      <AddDevice open={dialog === Dialog.ADD_DEVICE} onClose={close} />
      {dialog === Dialog.FILTER && <TimeSelect onClose={close} />}
    </>
  );
};

const stateToProps = (state) => ({
  dialog: selectLocation(state).dialog,
  dongleId: state.dongleId,
});

export default connect(stateToProps)(Dialogs);
