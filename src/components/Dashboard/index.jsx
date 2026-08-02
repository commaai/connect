import { lazy, Suspense } from 'react';
import { connect } from 'react-redux';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ primeNav, device, dongleId }) => {
  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

  return (
    <div className="flex flex-col">
      <Suspense fallback={<FullPageLoading />}>
        { primeNav
          ? <Prime />
          : (
            <>
              <Navigation />
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
  primeNav: state.primeNav,
  device: state.device,
});

export default connect(stateToProps)(Dashboard);
