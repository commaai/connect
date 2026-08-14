import { lazy, Suspense } from 'react';
import { connect } from 'react-redux';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';

const Prime = lazy(() => import('../Prime'));

export const Dashboard = ({ primeNav, device, devices, dongleId, deviceNotFound }) => {
  if (devices === null) {
    return <FullPageLoading />;
  }

  if (deviceNotFound || !dongleId) {
    return (
      <main className="flex min-h-[calc(100vh-66px)] w-full items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-white/60">Error 404</p>
          <h1 className="mt-2 text-2xl font-medium text-white">{deviceNotFound ? "Device not found" : "Page not found"}</h1>
        </div>
      </main>
    );
  }

  if (!device) return <FullPageLoading />;

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
  devices: state.devices,
  deviceNotFound: state.deviceNotFound,
});

export default connect(stateToProps)(Dashboard);
