import { lazy, Suspense } from 'react';
import { connect } from 'react-redux';

import DriveList from './DriveList';
import DeviceSettingsModal from './DeviceSettingsModal';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';
import { selectDevice } from '../../actions';
import { parseLocation } from '../../url';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ dispatch, page, device, dongleId, profile }) => {
  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

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
      { page === 'settings' && (device.is_owner || profile?.superuser) && (
        <DeviceSettingsModal key={dongleId} isOpen dongleId={dongleId} onClose={() => dispatch(selectDevice(dongleId))} />
      )}
    </div>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  page: parseLocation(state.router.location.pathname).page,
  device: state.device,
  profile: state.profile,
});

export default connect(stateToProps)(Dashboard);
