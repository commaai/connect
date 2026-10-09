import React, { useCallback, useState } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';

import { withStyles } from '@material-ui/core/styles';
import { Typography, IconButton, AppBar } from '@material-ui/core';

import MyCommaAuth from '@commaai/my-comma-auth';

import { navigateTo } from '../../actions/history';
import { pathOf, signInUrl, urlForDestination } from '../../url';
import { AccountIcon, GiftIcon, GiftOpenIcon, MenuIcon } from '../../icons';
import Colors from '../../colors';
import { filterRegularClick } from '../../utils';
import { hardNavigate } from '../../utils/navigation';

import AccountMenu from './AccountMenu';

const REFERRALS_SEEN_KEY = 'referralsGiftClicked';

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
  giftIcon: {
    color: Colors.white30,
    height: 28,
    width: 28,
  },
  giftButton: {
    position: 'relative',
  },
  newReferralsDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 9,
    height: 9,
    borderRadius: '50%',
    backgroundColor: Colors.primeBlue50,
  },
  activeGiftIcon: {
    color: Colors.white,
  },
});

const AppHeader = ({
  profile, classes, dispatch, drawerIsOpen, showDrawerButton,
  forwardRef, handleDrawerStateChanged, dongleId, page,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNewReferralsDot, setShowNewReferralsDot] = useState(() => (
    window.localStorage.getItem(REFERRALS_SEEN_KEY) !== 'true'
  ));

  const handleClickedAccount = useCallback(() => {
    if (MyCommaAuth.isAuthenticated()) {
      setMenuOpen((prev) => !prev);
    } else {
      hardNavigate(signInUrl(pathOf(window.location)));
    }
  }, []);

  const handleClose = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const openReferrals = useCallback(() => {
    dispatch(navigateTo({ page: 'referrals' }));
  }, [dispatch]);

  const toggleReferrals = useCallback(() => {
    window.localStorage.setItem(REFERRALS_SEEN_KEY, 'true');
    setShowNewReferralsDot(false);
    dispatch(navigateTo({ page: page === 'referrals' ? 'dashboard' : 'referrals' }));
  }, [dispatch, page]);

  const toggleDrawer = useCallback(() => {
    handleDrawerStateChanged(!drawerIsOpen);
  }, [drawerIsOpen, handleDrawerStateChanged]);

  const open = menuOpen;
  const referralsOpen = page === 'referrals';
  const ReferralsIcon = referralsOpen ? GiftOpenIcon : GiftIcon;

  return (
    <>
      <AppBar position="sticky" elevation={1}>
        <div ref={forwardRef} className={classes.header}>
          <div className={classes.titleContainer}>
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
                <Link to={urlForDestination({ page: 'dashboard', dongleId })} className={classes.logoImgLink}>
                  <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
                </Link>
              )}
            <Link to={urlForDestination({ page: 'dashboard', dongleId })}>
              <Typography className={classes.logoText}>connect</Typography>
            </Link>
          </div>
          <div className="flex flex-row gap-2">
            <IconButton
              component="a"
              href={urlForDestination({ page: referralsOpen ? 'dashboard' : 'referrals', dongleId })}
              aria-label="referrals"
              className={classes.giftButton}
              onClick={filterRegularClick(toggleReferrals)}
            >
              <ReferralsIcon className={`${classes.giftIcon} ${referralsOpen ? classes.activeGiftIcon : ''}`} />
              {showNewReferralsDot && <span aria-label="New referrals" className={classes.newReferralsDot} />}
            </IconButton>
            <div className="relative">
              <IconButton
                aria-expanded={open}
                aria-haspopup="true"
                onClick={handleClickedAccount}
                aria-label="account menu"
              >
                <AccountIcon className={classes.accountIcon} />
              </IconButton>
              {Boolean(MyCommaAuth.isAuthenticated() && profile) && (
                <AccountMenu
                  open={open}
                  onClose={handleClose}
                  onReferrals={openReferrals}
                  profile={profile}
                />
              )}
            </div>
          </div>
        </div>
      </AppBar>
    </>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  profile: state.profile,
  page: state.nav.page,
});

export default connect(stateToProps)(withStyles(styles)(AppHeader));
