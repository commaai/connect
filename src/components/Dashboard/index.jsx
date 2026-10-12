import { lazy, Suspense } from 'react';
import { connect } from 'react-redux';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ primeNav, notFound, device, dongleId, deviceNotFound }) => {
  if (notFound || deviceNotFound) {
    return (
      <main className="flex min-h-[calc(100vh-66px)] w-full items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-white/60">Error 404</p>
          <h1 className="mt-2 text-2xl font-medium text-white">{notFound ? "Page not found" : "Device not found"}</h1>
        </div>
      </main>
    );
  }

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
  primeNav: state.page === 'prime',
  notFound: state.page === 'not-found',
  device: state.device,
  deviceNotFound: state.deviceNotFound,
});

export default connect(stateToProps)(Dashboard);
