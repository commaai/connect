import { lazy, Suspense } from 'react';
import { connect } from 'react-redux';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';
import DeviceSettingsModal from './DeviceSettingsModal';
import { closeSettings } from '../../actions';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ page, device, dongleId, profile, dispatch }) => {
  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

  const settingsOpen = page === 'settings' && (device.is_owner || Boolean(profile?.superuser));
  return (
    <div className="relative flex flex-col">
      <Suspense fallback={<FullPageLoading />}>
        { page === 'prime'
          ? <Prime />
          : (
            <>
              <Navigation />
              <Promotions />
              <DeviceInfo />
              <DriveList />
            </>
          )}
      </Suspense>
      <DeviceSettingsModal
        isOpen={settingsOpen}
        dongleId={settingsOpen ? dongleId : null}
        onClose={() => dispatch(closeSettings())}
      />
    </div>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  page: state.page,
  profile: state.profile,
  device: state.device,
});

export default connect(stateToProps)(Dashboard);
