import Drawer from '@material-ui/core/Drawer';
import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { selectDevice } from '../../actions';
import DeviceList from '../Dashboard/DeviceList';

const listener = (ev) => ev.stopPropagation();

const AppDrawer = ({ isPermanent, drawerIsOpen, handleDrawerStateChanged, width }) => {
  const dispatch = useDispatch();
  const selectedDongleId = useSelector((state) => state.dongleId);
  const contentRef = useRef(null);

  useEffect(() => {
    const el = contentRef.current;
    if (el) el.addEventListener('touchstart', listener);
    return () => {
      if (el) el.removeEventListener('touchstart', listener);
    };
  }, []);

  const toggleDrawerOff = useCallback(() => {
    handleDrawerStateChanged(false);
  }, [handleDrawerStateChanged]);

  const handleDeviceSelected = useCallback(
    (dongleId) => {
      dispatch(selectDevice(dongleId));
      toggleDrawerOff();
    },
    [dispatch, toggleDrawerOff],
  );

  return (
    <Drawer open={isPermanent || drawerIsOpen} onClose={toggleDrawerOff} variant={isPermanent ? 'permanent' : 'temporary'} PaperProps={{ style: { width, top: 'auto' } }}>
      <div ref={contentRef} className="flex flex-col h-full bg-[linear-gradient(180deg,#1B2023_0%,#111516_100%)]">
        {!isPermanent && (
          <Link to="/" className="flex items-center min-h-[64px] mx-2">
            <img alt="comma" src="/images/comma-white.png" className="w-[18.9px] mx-6" />
            <span className="text-xl font-extrabold">connect</span>
          </Link>
        )}
        <DeviceList selectedDevice={selectedDongleId} handleDeviceSelected={handleDeviceSelected} />
      </div>
    </Drawer>
  );
};

export default AppDrawer;
