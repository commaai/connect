import { Button, CircularProgress, Divider, Modal, Paper, Typography } from '@mui/material';
import { withStyles } from '@mui/styles';
import localforage from 'localforage';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router';
import { replace } from '../navigation';

import { devices as Devices } from '@commaai/api';
import { checkLastRoutesData, selectDevice, updateDevice } from '../actions';
import init from '../actions/startup';
import Colors from '../colors';
import { pause, play } from '../timeline/playback';
import { pairErrorToMessage, verifyPairToken } from '../utils';
import { getSegmentRange } from '../url';
import AppDrawer from './AppDrawer';
import AppHeader from './AppHeader';
import Dashboard from './Dashboard';
import DriveView from './DriveView';
import NoDeviceUpsell from './DriveView/NoDeviceUpsell';
import IosPwaPopup from './IosPwaPopup';
import ResizeHandler from './ResizeHandler';
import PullDownReload from './utils/PullDownReload';

const styles = (theme) => ({
  window: {
    background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
    display: 'flex',
    flexDirection: 'column',
  },
  modal: {
    position: 'absolute',
    padding: theme.spacing(2),
    width: theme.spacing(50),
    maxWidth: '90%',
    left: '50%',
    top: '40%',
    transform: 'translate(-50%, -50%)',
    outline: 'none',
    '& p': { marginTop: 10 },
  },
  closeButton: {
    marginTop: 10,
    float: 'right',
    backgroundColor: Colors.grey200,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey400,
    },
  },
  fabProgress: {
    marginTop: 10,
  },
  pairedDongleId: {
    fontWeight: 'bold',
  },
});

const ExplorerApp = ({ classes }) => {
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
  const limit = useSelector((state) => state.limit);
  const routes = useSelector((state) => state.routes);

  // Calculate current route and zoom from location
  const seg = getSegmentRange(location?.pathname || '/');
  const currentRoute = (seg && routes && routes.find((r) => r.log_id === seg.log_id)) || null;
  let zoom = null;
  if (currentRoute) {
    const hasTimes = typeof seg.start === 'number' && typeof seg.end === 'number' && !Number.isNaN(seg.start) && !Number.isNaN(seg.end);
    zoom = hasTimes ? { start: seg.start - currentRoute.start_time_utc_millis, end: seg.end - currentRoute.start_time_utc_millis } : { start: 0, end: currentRoute.duration };
  }

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

  // Handle zoom changes for playback
  useEffect(() => {
    if (zoom) {
      dispatch(play());
    } else {
      dispatch(pause());
    }
  }, [zoom, dispatch]);

  // Check routes data when dongleId changes
  useEffect(() => {
    if (dongleId && limit === 0) {
      dispatch(checkLastRoutesData());
    }
  }, [dongleId, limit, dispatch]);

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

  return (
    <div>
      <ResizeHandler onResize={(ww) => setWindowWidth(ww)} />
      <PullDownReload />
      <AppHeader
        drawerIsOpen={drawerIsOpen}
        viewingRoute={Boolean(currentRoute)}
        showDrawerButton={!isLarge}
        handleDrawerStateChanged={handleDrawerStateChanged}
        forwardRef={updateHeaderRef}
      />
      <AppDrawer drawerIsOpen={drawerIsOpen} isPermanent={isLarge} width={sidebarWidth} handleDrawerStateChanged={handleDrawerStateChanged} style={drawerStyles} />
      <div className={classes.window} style={containerStyles}>
        {noDevicesUpsell ? <NoDeviceUpsell /> : currentRoute ? <DriveView /> : <Dashboard />}
      </div>
      <IosPwaPopup />
      <Modal open={Boolean(pairLoading || pairError || pairDongleId)} onClose={closePair}>
        <Paper className={classes.modal}>
          <Typography variant="h6">Pairing device</Typography>
          <Divider />
          {pairLoading && <CircularProgress size={32} className={classes.fabProgress} />}
          {pairDongleId && (
            <Typography>
              {'Successfully paired device '}
              <span className={classes.pairedDongleId}>{pairDongleId}</span>
            </Typography>
          )}
          {pairError && <Typography>{pairError}</Typography>}
          <Button variant="contained" className={classes.closeButton} onClick={closePair}>
            Close
          </Button>
        </Paper>
      </Modal>
    </div>
  );
};

export default withStyles(styles)(ExplorerApp);
