import { lazy, Suspense } from 'react';
import { connect } from 'react-redux';

import { parseUrl } from '../../url';
import DriveList from './DriveList';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ prime, device, dongleId }) => {
  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

  return (
    <div className="relative flex flex-col">
      <Suspense fallback={<FullPageLoading />}>
        { prime
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
    </div>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  prime: parseUrl(state.router.location.pathname, state.router.location.search).page === 'prime',
  device: state.device,
});

export default connect(stateToProps)(Dashboard);
