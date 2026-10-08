import { lazy, Suspense, useEffect, useRef } from 'react';
import { connect } from 'react-redux';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';
import { getDashboardMapHeight } from './mapSize';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ primeNav, device, dongleId }) => {
  const dashboardRef = useRef(null);

  useEffect(() => {
    let animationFrame = null;
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    const updateMapSize = () => {
      animationFrame = null;
      const height = getDashboardMapHeight(viewportHeight, window.scrollY);
      dashboardRef.current?.style.setProperty('--dashboard-map-height', `${height}px`);
    };
    const scheduleMapSizeUpdate = () => {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(updateMapSize);
      }
    };
    const onResize = () => {
      const nextViewportWidth = window.innerWidth;
      if (nextViewportWidth !== viewportWidth || nextViewportWidth > 639) {
        viewportWidth = nextViewportWidth;
        viewportHeight = window.innerHeight;
      }
      scheduleMapSizeUpdate();
    };

    window.addEventListener('scroll', scheduleMapSizeUpdate, { passive: true });
    window.addEventListener('resize', onResize);
    scheduleMapSizeUpdate();
    return () => {
      window.removeEventListener('scroll', scheduleMapSizeUpdate);
      window.removeEventListener('resize', onResize);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

  return (
    <div
      ref={dashboardRef}
      className="relative flex flex-col [overflow-anchor:none]"
      style={{ '--dashboard-map-height': '50vh' }}
    >
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
  primeNav: state.primeNav,
  device: state.device,
});

export default connect(stateToProps)(Dashboard);
