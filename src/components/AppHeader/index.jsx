import React, { useCallback, useEffect, useState } from 'react';
import { connect } from 'react-redux';

import { withStyles } from '@material-ui/core/styles';
import { Typography, IconButton, AppBar } from '@material-ui/core';

import MyCommaAuth from '@commaai/my-comma-auth';

import { navigateTo } from '../../actions';
import { AccountIcon, GiftClosedIcon, GiftOpenIcon, MenuIcon } from '../../icons';
import Colors from '../../colors';
import { filterRegularClick } from '../../utils';

import {
  disableNotifications,
  dismissNotificationsPrompt,
  enableNotifications,
  notificationsDenied,
  shouldPromptForNotifications,
  subscribeToPush,
} from '../../utils/notifications';
import NotificationsDialog, { NotificationsHelpDialog } from '../NotificationsDialog';

import AccountMenu from './AccountMenu';

const REFERRALS_SEEN_KEY = 'referralsGiftClicked';

const syncPushSubscription = () => subscribeToPush()
  .catch((err) => console.error('Failed to subscribe to push notifications:', err));

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
  giftIcon: {
    height: 28,
    width: 28,
    objectFit: 'contain',
    opacity: 0.3,
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
    opacity: 1,
  },
});

const AppHeader = ({
  profile, classes, dispatch, drawerIsOpen, showDrawerButton,
  forwardRef, handleDrawerStateChanged, dongleId, referralsOpen,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNewReferralsDot, setShowNewReferralsDot] = useState(() => (
    window.localStorage.getItem(REFERRALS_SEEN_KEY) !== 'true'
  ));
  const dashboardPath = dongleId ? `/${dongleId}` : '/';

  const [notificationsDialog, setNotificationsDialog] = useState(null);
  const loggedIn = Boolean(MyCommaAuth.isAuthenticated() && profile);

  useEffect(() => {
    if (!loggedIn) return;
    if (shouldPromptForNotifications()) setNotificationsDialog('ask');
    syncPushSubscription();
  }, [loggedIn]);

  const onEnableNotifications = useCallback(async () => {
    if (notificationsDenied()) {
      setMenuOpen(false);
      setNotificationsDialog('help');
      return;
    }
    dismissNotificationsPrompt();
    setNotificationsDialog(null);
    await enableNotifications();
    syncPushSubscription();
  }, []);

  const dismissNotificationsDialog = useCallback(() => {
    dismissNotificationsPrompt();
    setNotificationsDialog(null);
  }, []);

  const closeNotificationsDialog = useCallback(() => setNotificationsDialog(null), []);

  const onDisableNotifications = useCallback(
    () => disableNotifications().catch((err) => console.error('Failed to disable notifications:', err)),
    [],
  );

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

  const openReferrals = useCallback(() => {
    dispatch(navigateTo('referrals'));
  }, [dispatch]);

  const toggleReferrals = useCallback(() => {
    window.localStorage.setItem(REFERRALS_SEEN_KEY, 'true');
    setShowNewReferralsDot(false);
    dispatch(navigateTo(referralsOpen ? 'dashboard' : 'referrals'));
  }, [dispatch, referralsOpen]);

  const toggleDrawer = useCallback(() => {
    handleDrawerStateChanged(!drawerIsOpen);
  }, [drawerIsOpen, handleDrawerStateChanged]);

  const open = menuOpen;
  const referralsIcon = referralsOpen ? GiftOpenIcon : GiftClosedIcon;

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
                <a
                  href={dashboardPath}
                  className={classes.logoImgLink}
                  onClick={filterRegularClick(() => dispatch(navigateTo('dashboard')))}
                >
                  <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
                </a>
              )}
            <a
              href={dashboardPath}
              onClick={filterRegularClick(() => dispatch(navigateTo('dashboard')))}
            >
              <Typography className={classes.logoText}>connect</Typography>
            </a>
          </div>
          <div className="flex flex-row gap-2">
            <IconButton
              component="a"
              href={referralsOpen ? dashboardPath : '/referrals'}
              aria-label="referrals"
              className={classes.giftButton}
              onClick={filterRegularClick(toggleReferrals)}
            >
              <img
                src={referralsIcon}
                alt=""
                className={`${classes.giftIcon} ${referralsOpen ? classes.activeGiftIcon : ''}`}
              />
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
              {loggedIn && (
                <AccountMenu
                  open={open}
                  onClose={handleClose}
                  onReferrals={openReferrals}
                  onEnableNotifications={onEnableNotifications}
                  onDisableNotifications={onDisableNotifications}
                  profile={profile}
                />
              )}
            </div>
          </div>
        </div>
      </AppBar>
      <NotificationsDialog
        open={notificationsDialog === 'ask'}
        onAllow={onEnableNotifications}
        onDismiss={dismissNotificationsDialog}
      />
      <NotificationsHelpDialog open={notificationsDialog === 'help'} onClose={closeNotificationsDialog} />
    </>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  profile: state.profile,
});

export default connect(stateToProps)(withStyles(styles)(AppHeader));
