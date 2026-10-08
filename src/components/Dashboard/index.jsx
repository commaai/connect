import { lazy, Suspense } from 'react';
import { connect } from 'react-redux';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';
import { getPage } from '../../url';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ primeNav, device, dongleId }) => {
  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

  return (
    <div className="relative flex flex-col">
      <Suspense fallback={<FullPageLoading />}>
        { primeNav
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
  primeNav: getPage(state) === 'prime',
  device: state.device,
});

export default connect(stateToProps)(Dashboard);
