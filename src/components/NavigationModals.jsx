import { connect } from 'react-redux';
import MyCommaAuth from '@commaai/my-comma-auth';
import { Modal, Paper, Typography, Button } from '@material-ui/core';
import { closeModal } from '../actions/navigation';
import { visibleModal } from '../url/modals';
import DeviceSettingsModal from './Dashboard/DeviceSettingsModal';
import AddDevice from './Dashboard/AddDevice';
import TimeSelect from './TimeSelect';

const NavigationModals = ({ nav, dispatch }) => (
  <>
    {['settings', 'settings-uploads', 'unpair'].includes(nav.modal) && (
      <DeviceSettingsModal
        isOpen={nav.modal === 'settings'}
        modal={nav.modal}
        dongleId={nav.modalDevice || nav.dongleId}
        onClose={() => dispatch(closeModal())}
      />
    )}
    {nav.modal === 'filter' && <TimeSelect onClose={() => dispatch(closeModal())} />}
    {MyCommaAuth.isAuthenticated()
      ? <AddDevice modalHost open={nav.modal === 'pair'} />
      : nav.modal === 'pair' && (
        <Modal open onClose={() => dispatch(closeModal())} className="flex items-center justify-center">
          <Paper className="p-4 outline-none">
            <Typography>Sign in to pair a device.</Typography>
            <Button onClick={() => dispatch(closeModal())}>Close</Button>
          </Paper>
        </Modal>
      )}
  </>
);

export default connect(state => ({ nav: visibleModal(state) }))(NavigationModals);
