import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import dayjs from 'dayjs';

import { withStyles, Typography, Tooltip } from '@material-ui/core';

import { athena as Athena } from '@commaai/api';
import { primeNav, streamNav, fetchDeviceNotCar } from '../../actions';
import Colors from '../../colors';
import { deviceNamePretty, deviceIsOnline, deviceVersionAtLeast } from '../../utils';
import { webrtcConnectionManager } from '../../utils/webrtc';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import CommacareBadge from '../CommacareBadge';
import { LivestreamIcon, CarBatteryIcon, GamepadIcon } from '../../icons';

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
      windowWidth: window.innerWidth,
      bodyTeleopOpen: false,
    };

    this.onResize = this.onResize.bind(this);
    this.onVisible = this.onVisible.bind(this);
    this.fetchDeviceCarHealth = this.fetchDeviceCarHealth.bind(this);
    this.renderButtons = this.renderButtons.bind(this);
    this.prewarmBodyTeleop = this.prewarmBodyTeleop.bind(this);
    this.openBodyTeleop = this.openBodyTeleop.bind(this);
  }

  openBodyTeleop() {
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
        windowWidth: window.innerWidth,
      });
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
    if (!dongleId || !this.shouldPrewarmBodyTeleop()) return;
    webrtcConnectionManager.prewarm(dongleId);
  }

  render() {
    const { classes, device } = this.props;
    const commacare = device?.commacare;

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
      </>
    );
  }

  renderButtons() {
    const { classes, device } = this.props;
    const { carHealth, windowWidth } = this.state;
    const isCommaBody = device?.rpc?.not_car;

    let batteryVoltage;
    let batteryBackground = Colors.grey400;
    if (deviceIsOnline(device) && carHealth?.result && carHealth.result.peripheralState
      && carHealth.result.peripheralState.voltage) {
      batteryVoltage = carHealth.result.peripheralState.voltage / 1000.0;
      batteryBackground = batteryVoltage < 11.0 ? Colors.red400 : Colors.green400;
    }
    const batteryText = batteryVoltage ? `${batteryVoltage.toFixed(1)}\u00a0V` : 'N/A';

    const buttonOffline = deviceIsOnline(device) ? '' : classes.buttonOffline;

    let pingTooltip = 'no ping received from device';
    if (device.last_athena_ping) {
      const lastAthenaPing = dayjs(device.last_athena_ping * 1000);
      pingTooltip = `Last ping on ${lastAthenaPing.format('MMM D, YYYY')} at ${lastAthenaPing.format('h:mm A')}`;
    }

    // TO BE REMOVED: once 0.11.1 is deprecated, we can remove this since all devices should have livestreaming
    const livestreamEnabled = deviceVersionAtLeast(device, '0.11.2');
    const bodyTeleopEnabled = isCommaBody && livestreamEnabled;

    return (
      <div className='flex md:flex-row md:items-stretch justify-end flex-wrap gap-2 min-w-0 shrink'>
        {livestreamEnabled && (
          <Tooltip
            classes={{ tooltip: classes.popover }}
            title={ bodyTeleopEnabled ? 'Teleop' : 'Livestream' }
            placement="bottom"
          >
            <button
              style={!deviceIsOnline(device) ? { opacity: 0.3 } : {}}
              className={`${classes.button} ${classes.carBattery} ${buttonOffline}`}
              onClick={ this.openBodyTeleop }
              disabled={ !deviceIsOnline(device) }
            >
              { bodyTeleopEnabled
                ? <GamepadIcon className='text-black' />
                : <LivestreamIcon className='text-black' />}
            </button>
          </Tooltip>
        )}
        <div
          className={ classes.carBattery }
          style={{ backgroundColor: batteryBackground }}
        >
          { deviceIsOnline(device) ? (
            windowWidth >= 640 ? (
              <Typography>{ `car battery: ${batteryText}` }</Typography>
            ) : (
              <>
                <CarBatteryIcon className="text-[20px] mr-1" />
                <Typography>{ batteryText }</Typography>
              </>
            )
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
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(DeviceInfo));
