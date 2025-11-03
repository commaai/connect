import { athena as Athena, devices as Devices } from '@commaai/api';
import { Box, Button, CircularProgress, Popper, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import AccessTime from '@mui/icons-material/AccessTime';
import * as Sentry from '@sentry/react';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import Colors from '../../colors';
import { deviceIsOnline, deviceNamePretty } from '../../utils';
import { isMetric, KM_PER_MI } from '../../utils/conversions';
import ResizeHandler from '../ResizeHandler';
import TimeSelect from '../TimeSelect';
import VisibilityHandler from '../VisibilityHandler';

const Row = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 4,
  [theme.breakpoints.down('xs')]: {
    marginBottom: 8,
  },
}));

const ButtonRow = styled(Box)({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

const StatsRow = styled(Row)(({ theme }) => ({
  columnGap: theme.spacing(4),
}));

const DeviceStat = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  maxWidth: 80,
  padding: `0 ${theme.spacing(2)}`,
}));

const CarBattery = styled(Box)({
  padding: '5px 16px',
  borderRadius: 15,
  margin: '0 10px',
  textAlign: 'center',
  '& p': {
    fontSize: 14,
    fontWeight: 500,
    lineHeight: '1.4em',
  },
});

const StyledButton = styled(Button)(({ offline }) => ({
  backgroundColor: offline ? Colors.grey400 : Colors.white,
  color: offline ? Colors.lightGrey600 : Colors.grey900,
  textTransform: 'none',
  minHeight: 'unset',
  marginRight: '8px',
  '&:hover': {
    background: offline ? Colors.grey400 : '#ddd',
    color: offline ? Colors.lightGrey600 : Colors.grey900,
  },
  '&:disabled': {
    background: offline ? Colors.grey400 : '#ddd',
    color: offline ? Colors.lightGrey600 : Colors.grey900,
  },
  '&:disabled:hover': {
    background: offline ? Colors.grey400 : '#ddd',
    color: offline ? Colors.lightGrey600 : Colors.grey900,
  },
}));

const SnapshotContainer = styled(Box)({
  borderBottom: `1px solid ${Colors.white10}`,
});

const SnapshotContainerLarge = styled(Box)({
  maxWidth: 1050,
  margin: '0 auto',
  display: 'flex',
});

const SnapshotImageContainerLarge = styled(Box)({
  width: '50%',
  display: 'flex',
  justifyContent: 'center',
});

const SnapshotImage = styled('img')({
  display: 'block',
  width: '450px !important',
  maxWidth: '100%',
});

const SnapshotImageError = styled(Box)({
  width: 450,
  maxWidth: '100%',
  backgroundColor: Colors.grey950,
  padding: '0 80px',
  margin: '0 auto',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  '& p': {
    textAlign: 'center',
    fontSize: '1rem',
    '&:first-child': {
      fontWeight: 600,
    },
  },
});

const ScrollSnapContainer = styled(Box)({
  display: 'flex',
  overflowX: 'scroll',
  scrollSnapType: 'x mandatory',
  scrollBehavior: 'smooth',
  '&::-webkit-scrollbar': {
    height: '10px',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: '#d1d1d1',
    borderRadius: '8px',
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: '#272c2f',
  },
});

const ScrollSnapItem = styled(Box)({
  flex: '0 0 auto',
  scrollSnapAlign: 'start',
  width: '100%',
  maxWidth: '450px',
  margin: '0',
});

const StyledPopper = styled(Popper)({
  borderRadius: 22,
  padding: '8px 16px',
  border: `1px solid ${Colors.white10}`,
  backgroundColor: Colors.grey800,
  fontSize: 12,
  marginTop: 5,
  textAlign: 'center',
});

const StyledTooltip = styled(Tooltip)({
  '& .MuiTooltip-tooltip': {
    borderRadius: 22,
    padding: '8px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
});

const DeviceInfo = () => {
  const dongleId = useSelector((state) => state.dongleId);
  const device = useSelector((state) => state.device);

  const [deviceStats, setDeviceStats] = useState({});
  const [carHealth, setCarHealth] = useState({});
  const [snapshot, setSnapshot] = useState({});
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isTimeSelectOpen, setIsTimeSelectOpen] = useState(false);

  const snapshotButtonRef = useRef(null);
  const mounted = useRef(false);
  const prevDongleIdRef = useRef(dongleId);

  // Set mounted on initial mount
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Clear snapshot when dongleId changes (keep stats and car health for smoother transitions)
  useEffect(() => {
    if (dongleId && prevDongleIdRef.current !== dongleId) {
      prevDongleIdRef.current = dongleId;
      setSnapshot({});
    }
  }, [dongleId]);

  const onResize = (newWindowWidth) => {
    setWindowWidth(newWindowWidth);
  };

  const fetchDeviceInfo = useCallback(async () => {
    if (!device || device.shared) {
      return;
    }
    setDeviceStats((prev) => ({ ...prev, fetching: true }));
    try {
      const resp = await Devices.fetchDeviceStats(dongleId);
      if (mounted.current) {
        setDeviceStats({ result: resp });
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'device_info_device_stats' });
      setDeviceStats((prev) => ({ ...prev, error: err.message }));
    }
  }, [dongleId, device]);

  const fetchDeviceCarHealth = useCallback(async () => {
    if (!deviceIsOnline(device)) {
      setCarHealth({});
      return;
    }

    setCarHealth((prev) => ({ ...prev, fetching: true }));
    try {
      const payload = {
        method: 'getMessage',
        params: { service: 'peripheralState', timeout: 5000 },
        jsonrpc: '2.0',
        id: 0,
      };
      const resp = await Athena.postJsonRpcPayload(dongleId, payload);
      if (mounted.current) {
        setCarHealth(resp);
      }
    } catch (err) {
      if (mounted.current) {
        if (!err.message || err.message.indexOf('Device not registered') === -1) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'device_info_athena_pandastate' });
        }
        setCarHealth((prev) => ({ ...prev, error: err.message }));
      }
    }
  }, [dongleId, device]);

  const onVisible = useCallback(() => {
    if (device && !device.shared) {
      fetchDeviceInfo();
      fetchDeviceCarHealth();
    }
  }, [device, fetchDeviceInfo, fetchDeviceCarHealth]);

  const takeSnapshot = async () => {
    setSnapshot((prev) => ({ ...prev, error: null, fetching: true }));
    try {
      const payload = {
        method: 'takeSnapshot',
        jsonrpc: '2.0',
        id: 0,
      };
      let resp = await Athena.postJsonRpcPayload(dongleId, payload);
      if (resp.result && !resp.result.jpegBack && !resp.result.jpegFront) {
        resp = await Athena.postJsonRpcPayload(dongleId, payload);
      }
      if (resp.result && !resp.result.jpegBack && !resp.result.jpegFront) {
        throw new Error('unable to fetch snapshot');
      }
      setSnapshot(resp);
    } catch (err) {
      let error = err.message;
      if (error.indexOf('Device not registered') !== -1) {
        error = 'device offline';
      } else {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'device_info_snapshot' });
        if (error.length > 5 && error[5] === '{') {
          try {
            error = JSON.parse(error.substr(5)).error;
          } catch {
            //pass
          }
        }
      }
      setSnapshot({ error });
    }
  };

  const onOpenTimeSelect = () => {
    setIsTimeSelectOpen(true);
  };

  const onCloseTimeSelect = () => {
    setIsTimeSelectOpen(false);
  };

  const renderStats = () => {
    if (!deviceStats.result) {
      return (
        <>
          <DeviceStat sx={{ visibility: 'hidden' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              0
            </Typography>
            <Typography variant="subtitle1">miles</Typography>
          </DeviceStat>
          <DeviceStat sx={{ visibility: 'hidden' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              0
            </Typography>
            <Typography variant="subtitle1">drives</Typography>
          </DeviceStat>
          <DeviceStat sx={{ visibility: 'hidden' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              0
            </Typography>
            <Typography variant="subtitle1">hours</Typography>
          </DeviceStat>
        </>
      );
    }

    const metric = isMetric();
    const distance = metric ? Math.round(deviceStats.result.all.distance * KM_PER_MI) : Math.round(deviceStats.result.all.distance);

    return (
      <>
        <DeviceStat>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {distance}
          </Typography>
          <Typography variant="subtitle1">{metric ? 'kilometers' : 'miles'}</Typography>
        </DeviceStat>
        <DeviceStat>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {deviceStats.result.all.routes}
          </Typography>
          <Typography variant="subtitle1">drives</Typography>
        </DeviceStat>
        <DeviceStat>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {Math.round(deviceStats.result.all.minutes / 60.0)}
          </Typography>
          <Typography variant="subtitle1">hours</Typography>
        </DeviceStat>
      </>
    );
  };

  const renderButtons = () => {
    let batteryVoltage;
    let batteryBackground = Colors.grey400;
    if (deviceIsOnline(device) && carHealth?.result && carHealth.result.peripheralState && carHealth.result.peripheralState.voltage) {
      batteryVoltage = carHealth.result.peripheralState.voltage / 1000.0;
      batteryBackground = batteryVoltage < 11.0 ? Colors.red400 : Colors.green400;
    }

    const isOffline = !deviceIsOnline(device);
    const buttonSx = {
      minWidth: windowWidth >= 520 ? 130 : 90,
      padding: '5px 16px',
      borderRadius: 15,
    };

    const iconButtonSx = {
      minWidth: 60,
      padding: '8px 16px',
      borderRadius: 15,
    };

    let error = null;
    if (snapshot.error && snapshot.error.data && snapshot.error.data.message) {
      error = snapshot.error.data.message;
    } else if (snapshot.error && snapshot.error.message) {
      error = snapshot.error.message;
    } else if (snapshot.error) {
      error = 'error while fetching snapshot';
    }

    let pingTooltip = 'no ping received from device';
    if (device.last_athena_ping) {
      const lastAthenaPing = dayjs(device.last_athena_ping * 1000);
      pingTooltip = `Last ping on ${lastAthenaPing.format('MMM D, YYYY')} at ${lastAthenaPing.format('h:mm A')}`;
    }

    return (
      <>
        <CarBattery sx={{ backgroundColor: batteryBackground }}>
          {deviceIsOnline(device) ? (
            <Typography>{`${windowWidth >= 520 ? 'car ' : ''}battery: ${batteryVoltage ? `${batteryVoltage.toFixed(1)}\u00a0V` : 'N/A'}`}</Typography>
          ) : (
            <StyledTooltip title={pingTooltip} placement="bottom">
              <Typography>device offline</Typography>
            </StyledTooltip>
          )}
        </CarBattery>
        <StyledButton ref={snapshotButtonRef} offline={isOffline} sx={buttonSx} onClick={takeSnapshot} disabled={Boolean(snapshot.fetching || !deviceIsOnline(device))}>
          {snapshot.fetching ? <CircularProgress size={19} /> : 'take snapshot'}
        </StyledButton>
        <StyledButton sx={iconButtonSx} onClick={onOpenTimeSelect}>
          <AccessTime fontSize="inherit" />
        </StyledButton>
        <StyledPopper open={Boolean(error)} placement="bottom" anchorEl={snapshotButtonRef.current}>
          <Typography>{error}</Typography>
        </StyledPopper>
        <TimeSelect isOpen={isTimeSelectOpen} onClose={onCloseTimeSelect} />
      </>
    );
  };

  const renderSnapshotImage = (src, isFront) => {
    if (!src) {
      return (
        <SnapshotImageError>
          <Typography>{isFront && 'Interior'} snapshot not available</Typography>
          {isFront && <Typography>Enable &ldquo;Record and Upload Driver Camera&rdquo; on your device for interior camera snapshots</Typography>}
        </SnapshotImageError>
      );
    }

    return <SnapshotImage src={`data:image/jpeg;base64,${src}`} />;
  };

  const containerPadding = windowWidth > 520 ? 36 : 16;
  const largeSnapshotPadding = windowWidth > 1440 ? '12px 0' : 0;

  // Don't render if no device is selected
  if (!dongleId || !device) {
    return null;
  }

  return (
    <>
      <ResizeHandler onResize={onResize} />
      <VisibilityHandler onVisible={onVisible} onInit onDongleId minInterval={60} />
      <Box
        sx={{
          borderBottom: `1px solid ${Colors.white10}`,
          paddingTop: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 64,
          justifyContent: 'center',
          paddingLeft: `${containerPadding}px`,
          paddingRight: `${containerPadding}px`,
        }}
      >
        {windowWidth >= 768 ? (
          <StatsRow>
            <Typography variant="h6">{deviceNamePretty(device)}</Typography>
            <Box sx={{ display: 'flex', flex: 1 }}>{renderStats()}</Box>
            <ButtonRow>{renderButtons()}</ButtonRow>
          </StatsRow>
        ) : (
          <>
            <Row>
              <Typography variant="h6">{deviceNamePretty(device)}</Typography>
            </Row>
            <Row>{renderButtons()}</Row>
            <Row sx={{ display: 'flex', justifyContent: 'space-around' }}>{renderStats()}</Row>
          </>
        )}
      </Box>
      {snapshot.result && (
        <SnapshotContainer>
          {windowWidth >= 640 ? (
            <SnapshotContainerLarge sx={{ padding: largeSnapshotPadding }}>
              <SnapshotImageContainerLarge>{renderSnapshotImage(snapshot.result.jpegBack, false)}</SnapshotImageContainerLarge>
              <SnapshotImageContainerLarge>{renderSnapshotImage(snapshot.result.jpegFront, true)}</SnapshotImageContainerLarge>
            </SnapshotContainerLarge>
          ) : (
            <ScrollSnapContainer>
              <ScrollSnapItem>{renderSnapshotImage(snapshot.result.jpegBack, false)}</ScrollSnapItem>
              <ScrollSnapItem>{renderSnapshotImage(snapshot.result.jpegFront, true)}</ScrollSnapItem>
            </ScrollSnapContainer>
          )}
        </SnapshotContainer>
      )}
    </>
  );
};

export default DeviceInfo;
