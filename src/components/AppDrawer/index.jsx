import React, { useCallback, useEffect, useRef } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';

import Drawer from '@material-ui/core/Drawer';

import DeviceList from '../Dashboard/DeviceList';

import { navigate } from '../../actions/navigation';
import { buildLocation } from '../../url';
import { dashboardSelection } from '../../utils/links';

const listener = (ev) => ev.stopPropagation();

const AppDrawer = ({
  dispatch, isPermanent, drawerIsOpen, selectedDongleId, handleDrawerStateChanged, width, location,
}) => {
  const contentRef = useRef(null);
  const homeLink = buildLocation({
    ...dashboardSelection(selectedDongleId),
    search: location.search, hash: location.hash,
  });

  useEffect(() => {
    const el = contentRef.current;
    if (el) el.addEventListener('touchstart', listener);
    return () => {
      if (el) el.removeEventListener('touchstart', listener);
    };
  }, [contentRef]);

  const toggleDrawerOff = useCallback(() => {
    handleDrawerStateChanged(false);
  }, [handleDrawerStateChanged]);

  const handleDeviceSelected = useCallback((dongleId) => {
    dispatch(navigate(dashboardSelection(dongleId)));
    toggleDrawerOff();
  }, [dispatch, toggleDrawerOff]);

  return (
    <Drawer
      open={isPermanent || drawerIsOpen}
      onClose={toggleDrawerOff}
      variant={isPermanent ? 'permanent' : 'temporary'}
      PaperProps={{ style: { width, top: 'auto' } }}
    >
      <div ref={contentRef} className="flex flex-col h-full bg-[linear-gradient(180deg,#1B2023_0%,#111516_100%)] ml-safe-left">
        {!isPermanent
          && (
            <Link to={homeLink} className="flex items-center min-h-[64px] mx-2">
              <img alt="comma" src="/images/comma-white.png" className="w-[18.9px] mx-6" />
              <span className="text-xl font-extrabold">connect</span>
            </Link>
          )}
        <DeviceList
          selectedDevice={selectedDongleId}
          handleDeviceSelected={handleDeviceSelected}
        />
      </div>
    </Drawer>
  );
};

const stateToProps = (state) => ({
  selectedDongleId: state.dongleId,
  location: state.router.location,
});

export default connect(stateToProps)(AppDrawer);
