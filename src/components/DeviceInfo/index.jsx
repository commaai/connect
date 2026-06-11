import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import dayjs from 'dayjs';

import { withStyles, Typography, CircularProgress, Popper, Tooltip } from '@material-ui/core';

import { athena as Athena } from '@commaai/api';
import { analyticsEvent, primeNav, streamNav, fetchDeviceNotCar } from '../../actions';
import Colors from '../../colors';
import { deviceNamePretty, deviceIsOnline, deviceVersionAtLeast } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import CommacareBadge from '../CommacareBadge';

const styles = (theme) => ({
  container: {
    borderBottom: `1px solid ${Colors.white10}`,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 64,
    justifyContent: 'center',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  columnGap: {
    columnGap: theme.spacing.unit * 4,
  },
  bold: {
    fontWeight: 600,
  },
  button: {
    backgroundColor: Colors.white,
    color: Colors.grey900,
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
  carBattery: {
    padding: '5px 16px',
    borderRadius: 15,
    margin: '0 0px',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    '& p': {
      fontSize: 14,
      fontWeight: 500,
      lineHeight: '1.4em',
    },
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
    marginLeft: theme.spacing.unit,
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

class DeviceInfo extends Component {
  constructor(props) {
    super(props);
    this.mounted = null;
    this.state = {
      carHealth: {},
      snapshot: {},
      windowWidth: window.innerWidth,
      bodyTeleopOpen: false,
    };

    this.snapshotButtonRef = React.createRef();
    this.bodyTeleopPrewarm = null;
    this.bodyTeleopPrewarmAt = 0;

    this.onResize = this.onResize.bind(this);
    this.onVisible = this.onVisible.bind(this);
    this.fetchDeviceCarHealth = this.fetchDeviceCarHealth.bind(this);
    this.takeSnapshot = this.takeSnapshot.bind(this);
    this.snapshotType = this.snapshotType.bind(this);
    this.renderButtons = this.renderButtons.bind(this);
    this.renderSnapshotImage = this.renderSnapshotImage.bind(this);
    this.prewarmBodyTeleop = this.prewarmBodyTeleop.bind(this);
    this.openBodyTeleop = this.openBodyTeleop.bind(this);
  }

  openBodyTeleop() {
    this.prewarmBodyTeleop();
    this.props.dispatch(streamNav(true));
  }

  componentDidMount() {
    this.mounted = true;
    this.prewarmBodyTeleop();
  }

  componentDidUpdate(prevProps) {
    const { dongleId } = this.props;

    if (prevProps.dongleId !== dongleId) {
      this.setState({
        carHealth: {},
        snapshot: {},
        windowWidth: window.innerWidth,
      });
      this.bodyTeleopPrewarm = null;
      this.bodyTeleopPrewarmAt = 0;
    }

    this.prewarmBodyTeleop();
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  onVisible() {
    const { device, dongleId } = this.props;
    if (!device.shared) {
      this.fetchDeviceCarHealth();
      this.props.dispatch(fetchDeviceNotCar(dongleId));
    }
  }

  async fetchDeviceCarHealth() {
    const { dongleId, device } = this.props;
    if (!deviceIsOnline(device)) {
      this.setState({ carHealth: {} });
      return;
    }

    this.setState({ carHealth: { fetching: true } });
    try {
      const payload = {
        method: 'getMessage',
        params: { service: 'peripheralState', timeout: 5000 },
        jsonrpc: '2.0',
        id: 0,
      };
      const resp = await Athena.postJsonRpcPayload(dongleId, payload);
      if (this.mounted && dongleId === this.props.dongleId) {
        this.setState({ carHealth: resp });
      }
    } catch (err) {
      if (this.mounted && dongleId === this.props.dongleId) {
        if (!err.message || err.message.indexOf('Device not registered') === -1) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'device_info_athena_pandastate' });
        }
        this.setState({ carHealth: { error: err.message } });
      }
    }
  }

  shouldPrewarmBodyTeleop() {
    const { device } = this.props;
    return Boolean(deviceIsOnline(device) && device?.rpc?.not_car && deviceVersionAtLeast(device, '0.11.2'));
  }

  prewarmBodyTeleop() {
    const { dongleId } = this.props;
    const now = Date.now();
    if (!dongleId || !this.shouldPrewarmBodyTeleop()) return null;
    if (this.bodyTeleopPrewarm && now - this.bodyTeleopPrewarmAt < 30000) return this.bodyTeleopPrewarm;

    this.bodyTeleopPrewarmAt = now;
    this.bodyTeleopPrewarm = Athena.postJsonRpcPayload(dongleId, {
      method: 'echo',
      params: { s: 'webrtc-prewarm' },
      jsonrpc: '2.0',
      id: 0,
    }).catch(() => null);
    return this.bodyTeleopPrewarm;
  }

  async takeSnapshot() {
    const { dongleId } = this.props;
    const { snapshot } = this.state;
    this.setState({ snapshot: { ...snapshot, error: null, fetching: true } });
    this.props.dispatch(analyticsEvent('take_snapshot'));
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
      if (dongleId === this.props.dongleId) {
        this.setState({ snapshot: resp });
      }
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
      this.setState({ snapshot: { error } });
    }
  }

  snapshotType(showFront) {
    const { snapshot } = this.state;
    this.setState({ snapshot: { ...snapshot, showFront } });
  }

  render() {
    const { classes, device } = this.props;
    const { snapshot, windowWidth } = this.state;
    const commacare = device?.commacare;

    const largeSnapshotPadding = windowWidth > 1440 ? '12px 0' : 0;

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <VisibilityHandler onVisible={ this.onVisible } onInit onDongleId minInterval={ 60 } />
        <div className={`${classes.container} px-4`}>
          <div className={`flex flex-row justify-between items-center gap-4 md:my-2 my-4 pl-1`}>
            <div className='flex flex-col items-start md:flex-row md:items-center gap-4 shrink-0'>
              <div className={`flex flex-row gap-4 items-center`}>
                {commacare && <CommacareBadge onClick={() => this.props.dispatch(primeNav(true))} />}
                <Typography variant="title">{deviceNamePretty(device)}</Typography>
              </div>
            </div>
            { this.renderButtons() }
          </div>
        </div>
        { snapshot.result && (
          <div className={ classes.snapshotContainer }>
            { windowWidth >= 640
              ? (
                <div className={ classes.snapshotContainerLarge } style={{ padding: largeSnapshotPadding }}>
                  <div className={ classes.snapshotImageContainerLarge }>
                    { this.renderSnapshotImage(snapshot.result.jpegBack, false) }
                  </div>
                  <div className={ classes.snapshotImageContainerLarge }>
                    { this.renderSnapshotImage(snapshot.result.jpegFront, true) }
                  </div>
                </div>
              )
              : (
                <div className={ classes.scrollSnapContainer }>
                  <div className={ classes.scrollSnapItem }>
                    { this.renderSnapshotImage(snapshot.result.jpegBack, false) }
                  </div>
                  <div className={ classes.scrollSnapItem }>
                    { this.renderSnapshotImage(snapshot.result.jpegFront, true) }
                  </div>
                </div>
              )}
          </div>
          )}
      </>
    );
  }

  renderButtons() {
    const { classes, device } = this.props;
    const { snapshot, carHealth, windowWidth } = this.state;
    const isCommaBody = device?.rpc?.not_car;

    let batteryVoltage;
    let batteryBackground = Colors.grey400;
    if (deviceIsOnline(device) && carHealth?.result && carHealth.result.peripheralState
      && carHealth.result.peripheralState.voltage) {
      batteryVoltage = carHealth.result.peripheralState.voltage / 1000.0;
      batteryBackground = batteryVoltage < 11.0 ? Colors.red400 : Colors.green400;
    }

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

    const bodyTeleopEnabled = isCommaBody && deviceVersionAtLeast(device, '0.11.2');

    return (
      <div className='flex md:flex-row md:items-stretch justify-end flex-wrap gap-2 min-w-0 shrink'>
        {bodyTeleopEnabled ? (
          <button
            style={!deviceIsOnline(device) ? { opacity: 0.3 } : {}}
            className={`${classes.button} ${classes.carBattery} ${buttonOffline}`}
            onClick={ this.openBodyTeleop }
            onFocus={ this.prewarmBodyTeleop }
            onMouseEnter={ this.prewarmBodyTeleop }
            onTouchStart={ this.prewarmBodyTeleop }
            disabled={ !deviceIsOnline(device) }
          >
            <Typography className='text-black'>remote control</Typography>
          </button>
        ) : (
          <button
            ref={ this.snapshotButtonRef }
            className={`${classes.button} ${classes.carBattery} ${buttonOffline}`}
            onClick={ this.takeSnapshot }
            disabled={ Boolean(snapshot.fetching || !deviceIsOnline(device)) }
          >
            { snapshot.fetching
              ? <CircularProgress size={ 19 } />
              : <Typography className='text-black'>take snapshot</Typography>}
          </button>
        )}
        <div
          className={ classes.carBattery }
          style={{ backgroundColor: batteryBackground }}
        >
          { deviceIsOnline(device) ? (
            <Typography>
              { `${windowWidth >= 640 ? 'car ' : ''
              }battery: ${
                batteryVoltage ? `${batteryVoltage.toFixed(1)}\u00a0V` : 'N/A'}` }
            </Typography>
          ) : (
            <Tooltip
              classes={{ tooltip: classes.popover }}
              title={pingTooltip}
              placement="bottom"
            >
              <Typography>device offline</Typography>
            </Tooltip>
          )}
        </div>
        <Popper
          className={ classes.popover }
          open={ Boolean(error) }
          placement="bottom"
          anchorEl={ this.snapshotButtonRef.current }
        >
          <Typography>{ error }</Typography>
        </Popper>
      </div>
    );
  }

  renderSnapshotImage(src, isFront) {
    const { classes } = this.props;
    if (!src) {
      return (
        <div className={ classes.snapshotImageError }>
          <Typography>
            { isFront && 'Interior' }
            {' '}
            snapshot not available
          </Typography>
          { isFront
            && (
            <Typography>
              Enable &ldquo;Record and Upload Driver Camera&rdquo; on your device for interior camera snapshots
            </Typography>
            )}
        </div>
      );
    }

    return (<img src={ `data:image/jpeg;base64,${src}` } className={ classes.snapshotImage } />);
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(DeviceInfo));
