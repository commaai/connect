import React, { Suspense, useCallback, useState } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { IconButton, AppBar } from '@material-ui/core';
import MenuIcon from '@material-ui/icons/Menu';

import MyCommaAuth from '@commaai/my-comma-auth';

import { selectDevice } from '../../actions';
import { AccountIcon } from '../../icons';
import { filterRegularClick } from '../../utils';

import AccountMenu from './AccountMenu';
import PWAIcon from '../PWAIcon';

const AppHeader = ({
  profile, dispatch, drawerIsOpen, showDrawerButton,
  forwardRef, handleDrawerStateChanged, dongleId,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleClickedAccount = useCallback(() => {
    if (MyCommaAuth.isAuthenticated()) {
      setMenuOpen((prev) => !prev);
    } else if (window.location) {
      window.location = window.location.origin;
    }
  }, []);

  const handleClose = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const toggleDrawer = useCallback(() => {
    dispatch(handleDrawerStateChanged(!drawerIsOpen));
  }, [dispatch, drawerIsOpen, handleDrawerStateChanged]);

  const open = menuOpen;

  return (
    <AppBar position="sticky" elevation={1}>
      <div ref={forwardRef} className="flex flex-row flex-wrap items-center justify-between border-b border-content/10 bg-surface p-[7.5px]">
        <div className="flex flex-nowrap items-center">
          {showDrawerButton ? (
            <IconButton
              aria-label="menu"
              className="mr-3"
              onClick={toggleDrawer}
            >
              <MenuIcon />
            </IconButton>
          )
            : (
              <a
                href={`/${dongleId}`}
                className="leading-none"
                onClick={filterRegularClick(() => dispatch(selectDevice(dongleId)))}
              >
                <img alt="comma" src="/images/comma-white.png" className="mx-7 h-[34px] w-[18.9px]" />
              </a>
            )}
          <a
            href={`/${dongleId}`}
            onClick={filterRegularClick(() => dispatch(selectDevice(dongleId)))}
          >
            <p className="text-xl font-extrabold text-content">connect</p>
          </a>
        </div>
        <div className="flex flex-row gap-2">
          <Suspense><PWAIcon /></Suspense>
          <div className="relative">
            <IconButton
              aria-expanded={open}
              aria-haspopup="true"
              onClick={handleClickedAccount}
              aria-label="account menu"
            >
              <AccountIcon className="h-[34px] w-[34px] text-content/30" />
            </IconButton>
            {Boolean(MyCommaAuth.isAuthenticated() && profile) && (
              <AccountMenu
                open={open}
                onClose={handleClose}
                profile={profile}
              />
            )}
          </div>
        </div>
      </div>
    </AppBar>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  profile: 'profile',
});

export default connect(stateToProps)(AppHeader);
