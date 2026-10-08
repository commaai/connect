import { lazy, Suspense } from 'react';
import { connect } from 'react-redux';
import { push } from 'connected-react-router';

import DriveList from './DriveList';
import DeviceSettingsModal from './DeviceSettingsModal';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';
import { buildUrl } from '../../url';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ dispatch, page, device, dongleId, profile }) => {
  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

  const canEditDevice = device.is_owner || profile?.superuser;
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
      {page === 'settings' && canEditDevice && (
        <DeviceSettingsModal dongleId={dongleId} onClose={() => dispatch(push(buildUrl({ dongleId })))} />
      )}
    </div>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  page: state.page,
  device: state.device,
  profile: state.profile,
});

export default connect(stateToProps)(Dashboard);
