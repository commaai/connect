import { Box, Button, CircularProgress, Divider, Modal, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import localforage from 'localforage';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Route, Switch, useLocation } from 'react-router';
import { replace } from '../navigation';

import { devices as Devices } from '@commaai/api';
import { selectDevice, updateDevice } from '../actions';
import init from '../actions/startup';
import Colors from '../colors';
import { pairErrorToMessage, verifyPairToken } from '../utils';
import AppDrawer from './AppDrawer';
import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import DeviceInfo from './DeviceInfo';
import DriveView from './DriveView';
import Navigation from './Navigation';
import NoDeviceUpsell from './DriveView/NoDeviceUpsell';
import IosPwaPopup from './IosPwaPopup';
import ResizeHandler from './ResizeHandler';
import PullDownReload from './utils/PullDownReload';

const StyledPaper = styled(Paper)(({ theme }) => ({
  position: 'absolute',
  padding: theme.spacing(2),
  width: theme.spacing(50),
  maxWidth: '90%',
  left: '50%',
  top: '40%',
  transform: 'translate(-50%, -50%)',
  outline: 'none',
  '& p': { marginTop: 10 },
}));

const CloseButton = styled(Button)({
  marginTop: 10,
  float: 'right',
  backgroundColor: Colors.grey200,
  color: Colors.white,
  '&:hover': {
    backgroundColor: Colors.grey400,
  },
});

const ExplorerApp = () => {
  const dispatch = useDispatch();
  const location = useLocation();

  const [drawerIsOpen, setDrawerIsOpen] = useState(false);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState(null);
  const [pairDongleId, setPairDongleId] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const headerRef = useRef(null);

  // Get Redux state
  const dongleId = useSelector((state) => state.dongleId);
  const devices = useSelector((state) => state.devices);

  // Initial mount effect
  useEffect(() => {
    window.scrollTo({ top: 0 }); // for ios header

    const q = new URLSearchParams(window.location.search);
    if (q.has('r')) {
      replace(q.get('r'));
    }

    dispatch(init());
  }, [dispatch]);

  // Handle pairing on mount
  useEffect(() => {
    const handlePairing = async () => {
      let pairToken;
      try {
        pairToken = await localforage.getItem('pairToken');
      } catch (err) {
        console.error(err);
      }
      if (pairToken && !pairLoading && !pairError && !pairDongleId) {
        setPairLoading(true);

        try {
          verifyPairToken(pairToken, true, 'explorer_pair_verify_pairtoken');
        } catch (err) {
          setPairLoading(false);
          setPairDongleId(null);
          setPairError(`Error: ${err.message}`);
          await localforage.removeItem('pairToken');
          return;
        }

        try {
          const resp = await Devices.pilotPair(pairToken);
          if (resp.dongle_id) {
            await localforage.removeItem('pairToken');
            setPairLoading(false);
            setPairError(null);
            setPairDongleId(resp.dongle_id);

            const device = await Devices.fetchDevice(resp.dongle_id);
            dispatch(updateDevice(device));
          } else {
            await localforage.removeItem('pairToken');
            console.log(resp);
            setPairDongleId(null);
            setPairLoading(false);
            setPairError('Error: could not pair, please try again');
          }
        } catch (err) {
          await localforage.removeItem('pairToken');
          const msg = pairErrorToMessage(err, 'explorer_pair_pairtoken');
          setPairDongleId(null);
          setPairLoading(false);
          setPairError(`Error: ${msg}, please try again`);
        }
      }
    };

    handlePairing();
  }, [dispatch, pairLoading, pairError, pairDongleId]);

  // Close drawer on pathname change
  useEffect(() => {
    if (location.pathname) {
      setDrawerIsOpen(false);
    }
  }, [location.pathname]);

  const closePair = async () => {
    await localforage.removeItem('pairToken');
    if (pairDongleId) {
      dispatch(selectDevice(pairDongleId));
    }
    setPairLoading(false);
    setPairError(null);
    setPairDongleId(null);
  };

  const handleDrawerStateChanged = (drawerOpen) => {
    setDrawerIsOpen(drawerOpen);
  };

  const updateHeaderRef = (ref) => {
    if (!headerRef.current) {
      headerRef.current = ref;
    }
  };

  const noDevicesUpsell = devices?.length === 0 && !dongleId;
  const isLarge = noDevicesUpsell || windowWidth > 1080;

  const sidebarWidth = noDevicesUpsell ? 0 : Math.max(280, windowWidth * 0.2);
  const headerHeight = headerRef.current ? headerRef.current.getBoundingClientRect().height : windowWidth < 640 ? 111 : 66;
  let containerStyles = {
    minHeight: `calc(100vh - ${headerHeight}px)`,
  };
  if (isLarge) {
    containerStyles = {
      ...containerStyles,
      width: `calc(100% - ${sidebarWidth}px)`,
      marginLeft: sidebarWidth,
    };
  }

  const drawerStyles = {
    minHeight: `calc(100vh - ${headerHeight}px)`,
  };

  // Check if we're viewing a route based on URL
  const isViewingRoute = location.pathname.split('/').filter(Boolean).length >= 2;

  return (
    <div>
      <ResizeHandler onResize={(ww) => setWindowWidth(ww)} />
      <PullDownReload />
      <AppHeader
        drawerIsOpen={drawerIsOpen}
        viewingRoute={isViewingRoute}
        showDrawerButton={!isLarge}
        handleDrawerStateChanged={handleDrawerStateChanged}
        forwardRef={updateHeaderRef}
      />
      <AppDrawer drawerIsOpen={drawerIsOpen} isPermanent={isLarge} width={sidebarWidth} handleDrawerStateChanged={handleDrawerStateChanged} style={drawerStyles} />
      <Box
        sx={{
          background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
          display: 'flex',
          flexDirection: 'column',
        }}
        style={containerStyles}
      >
        {noDevicesUpsell ? (
          <NoDeviceUpsell />
        ) : (
          <>
            <Navigation />
            <DeviceInfo />
            <Switch>
              <Route path="/:dongleId/:routeId/:start/:end" component={DriveView} />
              <Route path="/:dongleId/:routeId" component={DriveView} />
              <Route path="/:dongleId" component={Dashboard} />
              <Route path="/" component={Dashboard} />
            </Switch>
          </>
        )}
      </Box>
      <IosPwaPopup />
      <Modal open={Boolean(pairLoading || pairError || pairDongleId)} onClose={closePair}>
        <StyledPaper>
          <Typography variant="h6">Pairing device</Typography>
          <Divider />
          {pairLoading && <CircularProgress size={32} sx={{ mt: 1.25 }} />}
          {pairDongleId && (
            <Typography>
              {'Successfully paired device '}
              <Box component="span" sx={{ fontWeight: 'bold' }}>
                {pairDongleId}
              </Box>
            </Typography>
          )}
          {pairError && <Typography>{pairError}</Typography>}
          <CloseButton variant="contained" onClick={closePair}>
            Close
          </CloseButton>
        </StyledPaper>
      </Modal>
    </div>
  );
};

export default ExplorerApp;
