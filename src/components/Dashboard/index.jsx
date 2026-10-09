import { lazy, Suspense } from 'react';
import { connect } from 'react-redux';
import { push } from 'connected-react-router';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';
import DeviceSettingsModal from './DeviceSettingsModal';
import { Page, buildUrl, selectPage } from '../../url';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ page, device, dongleId, dispatch }) => {
  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

  return (
    <div className="relative flex flex-col">
      <Suspense fallback={<FullPageLoading />}>
        { page === Page.PRIME
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
      { page === Page.SETTINGS && (
        <DeviceSettingsModal dongleId={dongleId} onClose={() => dispatch(push(buildUrl({ dongleId })))} />
      )}
    </div>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  page: selectPage(state),
  device: state.device,
});

export default connect(stateToProps)(Dashboard);
