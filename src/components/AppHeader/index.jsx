import MyCommaAuth from '@commaai/my-comma-auth';
import { AppBar, Icon, IconButton, Typography } from '@mui/material';

import { styled } from '@mui/material/styles';
import { Suspense, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { selectDevice } from '../../actions';
import Colors from '../../colors';
import { AccountIcon } from '../../icons';
import { filterRegularClick } from '../../utils';
import PWAIcon from '../PWAIcon';
import AccountMenu from './AccountMenu';

const Header = styled('div')({
  backgroundColor: '#1D2225',
  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 7.5,
  flexWrap: 'wrap',
});

const TitleContainer = styled('div')({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'nowrap',
});

const LogoImgLink = styled('a')({
  lineHeight: 0,
});

const LogoImg = styled('img')({
  height: 34,
  width: 18.9,
  margin: '0px 28px',
});

const LogoText = styled(Typography)({
  fontSize: 20,
  fontWeight: 800,
});

const StyledAccountIcon = styled(AccountIcon)({
  color: Colors.white30,
  height: 34,
  width: 34,
});

const AppHeader = ({ drawerIsOpen, viewingRoute, showDrawerButton, forwardRef, handleDrawerStateChanged }) => {
  const dispatch = useDispatch();
  const dongleId = useSelector((state) => state.dongleId);
  const profile = useSelector((state) => state.profile);
  const [anchorEl, setAnchorEl] = useState(null);

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

  const open = Boolean(anchorEl);

  return (
    <>
      <AppBar position="sticky" elevation={1}>
        <Header ref={forwardRef}>
          <TitleContainer>
            {showDrawerButton ? (
              <IconButton aria-label="menu" className="mr-3" onClick={toggleDrawer}>
                <Icon>menu</Icon>
              </IconButton>
            ) : (
              <LogoImgLink href={`/${dongleId}`} onClick={filterRegularClick(() => dispatch(selectDevice(dongleId)))}>
                <LogoImg alt="comma" src="/images/comma-white.png" />
              </LogoImgLink>
            )}
            <a href={`/${dongleId}`} onClick={filterRegularClick(() => dispatch(selectDevice(dongleId)))}>
              <LogoText>connect</LogoText>
            </a>
          </TitleContainer>
          <div className="flex flex-row gap-2">
            <Suspense>
              <PWAIcon />
            </Suspense>
            <IconButton aria-owns={open ? 'menu-appbar' : null} aria-haspopup="true" onClick={handleClickedAccount} aria-label="account menu">
              <StyledAccountIcon />
            </IconButton>
          </div>
        </Header>
      </AppBar>
      {Boolean(MyCommaAuth.isAuthenticated() && profile) && <AccountMenu id="menu-appbar" open={open} anchorEl={anchorEl} onClose={handleClose} profile={profile} />}
    </>
  );
};

export default AppHeader;
