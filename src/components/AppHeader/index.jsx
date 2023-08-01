import React, { Suspense, useCallback, useState } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import { Typography, IconButton, Icon, AppBar } from '@material-ui/core';

import MyCommaAuth from '@commaai/my-comma-auth';

import { selectDevice } from '../../actions';
import { AccountIcon } from '../../icons';
import Colors from '../../colors';
import ResizeHandler from '../ResizeHandler';
import { filterRegularClick } from '../../utils';

import AccountMenu from './AccountMenu';
import TimeFilter from './TimeFilter';
import PWAIcon from '../PWAIcon';

const styles = () => ({
  header: {
    backgroundColor: '#1D2225',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 7.5,
    flexWrap: 'wrap',
  },
  titleContainer: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  logo: {
    alignItems: 'center',
    display: 'flex',
    maxWidth: 200,
    textDecoration: 'none',
  },
  logoImgLink: {
    lineHeight: 0,
  },
  logoImg: {
    height: 34,
    width: 18.9,
    margin: '0px 28px',
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
  },
  accountIcon: {
    color: Colors.white30,
    height: 34,
    width: 34,
  },
});

const AppHeader = ({
  profile, classes, dispatch, drawerIsOpen, annotating, showDrawerButton,
  forwardRef, clips, handleDrawerStateChanged, primeNav, dongleId,
}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const handleClickedAccount = useCallback((event) => {
    if (MyCommaAuth.isAuthenticated()) {
      setAnchorEl(event.currentTarget);
    } else if (window.location) {
      window.location = window.location.origin;
    }
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const toggleDrawer = useCallback(() => {
    dispatch(handleDrawerStateChanged(!drawerIsOpen));
  }, [dispatch, drawerIsOpen, handleDrawerStateChanged]);

  const onResize = useCallback((width) => {
    setWindowWidth(width);
  }, []);

  const open = Boolean(anchorEl);

  let reorderWideStyle = {};
  if (windowWidth < 640) {
    reorderWideStyle = {
      order: 4,
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
    };
  }

  return (
    <>
      <ResizeHandler onResize={onResize} />
      <AppBar position="sticky" elevation={1}>
        <div ref={forwardRef} className={classes.header}>
          <div className={classes.titleContainer}>
            {showDrawerButton ? (
              <IconButton
                aria-label="menu"
                className="mr-3"
                onClick={toggleDrawer}
              >
                <Icon>menu</Icon>
              </IconButton>
            )
              : (
                <a
                  href={`/${dongleId}`}
                  className={classes.logoImgLink}
                  onClick={filterRegularClick(() => dispatch(selectDevice(dongleId)))}
                >
                  <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
                </a>
              )}
            <a
              href={`/${dongleId}`}
              onClick={filterRegularClick(() => dispatch(selectDevice(dongleId)))}
            >
              <Typography className={classes.logoText}>connect</Typography>
            </a>
          </div>
          <div className={classes.headerWideItem} style={reorderWideStyle}>
            {Boolean(!primeNav && !clips && !annotating && dongleId) && <TimeFilter />}
          </div>
          <div className="flex flex-row gap-2">
            <Suspense><PWAIcon /></Suspense>
            <IconButton
              aria-owns={open ? 'menu-appbar' : null}
              aria-haspopup="true"
              onClick={handleClickedAccount}
              aria-label="account menu"
            >
              <AccountIcon className={classes.accountIcon} />
            </IconButton>
          </div>
        </div>
      </AppBar>
      {Boolean(MyCommaAuth.isAuthenticated() && profile) && (
        <AccountMenu
          id="menu-appbar"
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          profile={profile}
        />
      )}
    </>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  filter: 'filter',
  profile: 'profile',
  primeNav: 'primeNav',
  clips: 'clips',
});

export default connect(stateToProps)(withStyles(styles)(AppHeader));
