import { athena as Athena, devices as Devices } from '@commaai/api';
import { Button, CircularProgress, Popper, Tooltip, Typography } from '@mui/material';
import { withStyles } from '@mui/styles';
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

const styles = (theme) => ({
  container: {
    borderBottom: `1px solid ${Colors.white10}`,
    paddingTop: 8,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 64,
    justifyContent: 'center',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    [theme.breakpoints.down('xs')]: {
      marginBottom: 8,
    },
  },
  columnGap: {
    columnGap: theme.spacing(4),
  },
  bold: {
    fontWeight: 600,
  },
  button: {
    backgroundColor: Colors.white,
    color: Colors.grey900,
    textTransform: 'none',
    minHeight: 'unset',
    marginRight: '8px',
    '&:hover': {
      background: '#ddd',
      color: Colors.grey900,
    },
    '&:disabled': {
      background: '#ddd',
      color: Colors.grey900,
    },
    '&:disabled:hover': {
      background: '#ddd',
      color: Colors.grey900,
    },
  },
  buttonOffline: {
    background: Colors.grey400,
    color: Colors.lightGrey600,
    '&:disabled': {
      background: Colors.grey400,
      color: Colors.lightGrey600,
    },
    '&:disabled:hover': {
      background: Colors.grey400,
      color: Colors.lightGrey600,
    },
  },
  buttonRow: {
    justifyContent: 'center',
  },
  spaceAround: {
    display: 'flex',
    justifyContent: 'space-around',
  },
  deviceStatContainer: {
    display: 'flex',
    flex: 1,
    justifySelf: 'start',
  },
  deviceStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: 80,
    padding: `0 ${theme.spacing(2)}`,
  },
  carBattery: {
    padding: '5px 16px',
    borderRadius: 15,
    margin: '0 10px',
    textAlign: 'center',
    '& p': {
      fontSize: 14,
      fontWeight: 500,
      lineHeight: '1.4em',
    },
  },
  actionButton: {
    minWidth: 130,
    padding: '5px 16px',
    borderRadius: 15,
  },
  actionButtonSmall: {
    minWidth: 90,
    padding: '5px 10px',
    borderRadius: 15,
  },
  actionButtonIcon: {
    minWidth: 60,
    padding: '8px 16px',
    borderRadius: 15,
  },
  snapshotContainer: {
    borderBottom: `1px solid ${Colors.white10}`,
  },
  snapshotContainerLarge: {
    maxWidth: 1050,
    margin: '0 auto',
    display: 'flex',
  },
  snapshotImageContainerLarge: {
    width: '50%',
    display: 'flex',
    justifyContent: 'center',
  },
  snapshotImage: {
    display: 'block',
    width: '450px !important',
    maxWidth: '100%',
  },
  snapshotImageError: {
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
  },
  scrollSnapContainer: {
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
  },
  scrollSnapItem: {
    flex: '0 0 auto',
    scrollSnapAlign: 'start',
    width: '100%',
    maxWidth: '450px',
    margin: '0',
  },
  buttonIcon: {
    fontSize: 20,
    marginLeft: theme.spacing(1),
  },
  popover: {
    borderRadius: 22,
    padding: '8px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
});

const DeviceInfo = ({ classes }) => {
  const dongleId = useSelector((state) => state.dongleId);
  const device = useSelector((state) => state.device);

  const [deviceStats, setDeviceStats] = useState({});
  const [carHealth, setCarHealth] = useState({});
  const [snapshot, setSnapshot] = useState({});
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isTimeSelectOpen, setIsTimeSelectOpen] = useState(false);

  const snapshotButtonRef = useRef(null);
  const mounted = useRef(false);

  // Set mounted on initial mount
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Reset state when dongleId changes
  useEffect(() => {
    if (dongleId) {
      setDeviceStats({});
      setCarHealth({});
      setSnapshot({});
      setWindowWidth(window.innerWidth);
    }
  }, [dongleId]);

  const onResize = (newWindowWidth) => {
    setWindowWidth(newWindowWidth);
  };

  const fetchDeviceInfo = useCallback(async () => {
    if (device.shared) {
      return;
    }
    setDeviceStats({ fetching: true });
    try {
      const resp = await Devices.fetchDeviceStats(dongleId);
      if (mounted.current) {
        setDeviceStats({ result: resp });
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'device_info_device_stats' });
      setDeviceStats({ error: err.message });
    }
  }, [dongleId, device.shared]);

  const fetchDeviceCarHealth = useCallback(async () => {
    if (!deviceIsOnline(device)) {
      setCarHealth({});
      return;
    }

    setCarHealth({ fetching: true });
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
        setCarHealth({ error: err.message });
      }
    }
  }, [dongleId, device]);

  const onVisible = useCallback(() => {
    if (!device.shared) {
      fetchDeviceInfo();
      fetchDeviceCarHealth();
    }
  }, [device.shared, fetchDeviceInfo, fetchDeviceCarHealth]);

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
          <div />
          <div />
          <div />
        </>
      );
    }

    const metric = isMetric();
    const distance = metric ? Math.round(deviceStats.result.all.distance * KM_PER_MI) : Math.round(deviceStats.result.all.distance);

    return (
      <>
        <div className={classes.deviceStat}>
          <Typography variant="subheading" className={classes.bold}>
            {distance}
          </Typography>
          <Typography variant="subheading">{metric ? 'kilometers' : 'miles'}</Typography>
        </div>
        <div className={classes.deviceStat}>
          <Typography variant="subheading" className={classes.bold}>
            {deviceStats.result.all.routes}
          </Typography>
          <Typography variant="subheading">drives</Typography>
        </div>
        <div className={classes.deviceStat}>
          <Typography variant="subheading" className={classes.bold}>
            {Math.round(deviceStats.result.all.minutes / 60.0)}
          </Typography>
          <Typography variant="subheading">hours</Typography>
        </div>
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

    const actionButtonClass = windowWidth >= 520 ? classes.actionButton : classes.actionButtonSmall;
    const buttonOffline = deviceIsOnline(device) ? '' : classes.buttonOffline;

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
        <div className={classes.carBattery} style={{ backgroundColor: batteryBackground }}>
          {deviceIsOnline(device) ? (
            <Typography>{`${windowWidth >= 520 ? 'car ' : ''}battery: ${batteryVoltage ? `${batteryVoltage.toFixed(1)}\u00a0V` : 'N/A'}`}</Typography>
          ) : (
            <Tooltip classes={{ tooltip: classes.popover }} title={pingTooltip} placement="bottom">
              <Typography>device offline</Typography>
            </Tooltip>
          )}
        </div>
        <Button
          ref={snapshotButtonRef}
          classes={{ root: `${classes.button} ${actionButtonClass} ${buttonOffline}` }}
          onClick={takeSnapshot}
          disabled={Boolean(snapshot.fetching || !deviceIsOnline(device))}
        >
          {snapshot.fetching ? <CircularProgress size={19} /> : 'take snapshot'}
        </Button>
        <Button classes={{ root: `${classes.button} ${classes.actionButtonIcon}` }} onClick={onOpenTimeSelect}>
          <AccessTime fontSize="inherit" />
        </Button>
        <Popper className={classes.popover} open={Boolean(error)} placement="bottom" anchorEl={snapshotButtonRef.current}>
          <Typography>{error}</Typography>
        </Popper>
        <TimeSelect isOpen={isTimeSelectOpen} onClose={onCloseTimeSelect} />
      </>
    );
  };

  const renderSnapshotImage = (src, isFront) => {
    if (!src) {
      return (
        <div className={classes.snapshotImageError}>
          <Typography>{isFront && 'Interior'} snapshot not available</Typography>
          {isFront && <Typography>Enable &ldquo;Record and Upload Driver Camera&rdquo; on your device for interior camera snapshots</Typography>}
        </div>
      );
    }

    return <img src={`data:image/jpeg;base64,${src}`} className={classes.snapshotImage} />;
  };

  const containerPadding = windowWidth > 520 ? 36 : 16;
  const largeSnapshotPadding = windowWidth > 1440 ? '12px 0' : 0;

  return (
    <>
      <ResizeHandler onResize={onResize} />
      <VisibilityHandler onVisible={onVisible} onInit onDongleId minInterval={60} />
      <div className={classes.container} style={{ paddingLeft: containerPadding, paddingRight: containerPadding }}>
        {windowWidth >= 768 ? (
          <div className={`${classes.row} ${classes.columnGap}`}>
            <Typography variant="title">{deviceNamePretty(device)}</Typography>
            <div className={classes.deviceStatContainer}>{renderStats()}</div>
            <div className={`${classes.row} ${classes.buttonRow}`}>{renderButtons()}</div>
          </div>
        ) : (
          <>
            <div className={classes.row}>
              <Typography variant="title">{deviceNamePretty(device)}</Typography>
            </div>
            <div className={classes.row}>{renderButtons()}</div>
            {deviceStats.result && <div className={`${classes.row} ${classes.spaceAround}`}>{renderStats()}</div>}
          </>
        )}
      </div>
      {snapshot.result && (
        <div className={classes.snapshotContainer}>
          {windowWidth >= 640 ? (
            <div className={classes.snapshotContainerLarge} style={{ padding: largeSnapshotPadding }}>
              <div className={classes.snapshotImageContainerLarge}>{renderSnapshotImage(snapshot.result.jpegBack, false)}</div>
              <div className={classes.snapshotImageContainerLarge}>{renderSnapshotImage(snapshot.result.jpegFront, true)}</div>
            </div>
          ) : (
            <div className={classes.scrollSnapContainer}>
              <div className={classes.scrollSnapItem}>{renderSnapshotImage(snapshot.result.jpegBack, false)}</div>
              <div className={classes.scrollSnapItem}>{renderSnapshotImage(snapshot.result.jpegFront, true)}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default withStyles(styles)(DeviceInfo);
