import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import { withStyles, Typography, Button, CircularProgress, Popper } from '@material-ui/core';
import "react-responsive-carousel/lib/styles/carousel.min.css"; // requires a loader
import { Carousel } from 'react-responsive-carousel';

import * as Demo from '../../demo';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import Colors from '../../colors';
import { deviceTypePretty, deviceIsOnline } from '../../utils'
import { devices as DevicesApi, athena as AthenaApi } from '@commaai/comma-api';

const styles = () => ({
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
    marginBottom: 8,
  },
  bold: {
    fontWeight: 600,
  },
  button: {
    backgroundColor: Colors.white,
    color: Colors.grey800,
    color: '#404B4F',
    textTransform: 'none',
    minHeight: 'unset',
    '&:hover': {
      background: '#ddd',
      color: '#404B4F',
    },
    '&:disabled': {
      background: '#ddd',
      color: '#404B4F',
    },
    '&:disabled:hover': {
      background: '#ddd',
      color: '#404B4F',
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
  spaceAround: {
    display: 'flex',
    justifyContent: 'space-around',
  },
  deviceStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: 80,
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
  snapshotButton: {
    minWidth: 130,
    padding: '5px 16px',
    borderRadius: 15,
  },
  snapshotButtonSmall: {
    minWidth: 90,
    padding: '5px 10px',
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
  snapshotErrorPopover: {
    borderRadius: 22,
    padding: '8px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    marginTop: 5,
    textAlign: 'center',
    maxWidth: '90%',
  },
});

class DeviceInfo extends Component {
  constructor(props) {
    super(props);
    this.mounted = null;
    this.state = {
      deviceStats: {},
      carHealth: {},
      snapshot: {},
      windowWidth: window.innerWidth,
    };

    this.snapshotButtonRef = React.createRef();

    this.onResize = this.onResize.bind(this);
    this.onVisible = this.onVisible.bind(this);
    this.fetchDeviceInfo = this.fetchDeviceInfo.bind(this);
    this.fetchDeviceCarHealth = this.fetchDeviceCarHealth.bind(this);
    this.takeSnapshot = this.takeSnapshot.bind(this);
    this.snapshotType = this.snapshotType.bind(this);
    this.renderButtons = this.renderButtons.bind(this);
    this.renderStats = this.renderStats.bind(this);
    this.renderSnapshotImage = this.renderSnapshotImage.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
  }

  componentDidUpdate(prevProps) {
    const { dongleId } = this.props;

    if (prevProps.dongleId !== dongleId) {
      this.setState({
        deviceStats: {},
        carHealth: {},
        snapshot: {},
        windowWidth: window.innerWidth,
      });
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  onVisible() {
    if (!Demo.isDemo()) {
      this.fetchDeviceInfo();
      this.fetchDeviceCarHealth();
    }
  }

  async fetchDeviceInfo() {
    const { dongleId } = this.props;
    this.setState({ deviceStats: { fetching: true }});
    try {
      const resp = await DevicesApi.fetchDeviceStats(dongleId);
      if (this.mounted && dongleId === this.props.dongleId) {
        this.setState({ deviceStats: { result: resp }});
      }
    } catch(err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'device_info_device_stats' });
      this.setState({ deviceStats: { error: err.message }});
    }
  }

  async fetchDeviceCarHealth() {
    const { dongleId, device } = this.props;
    if (!deviceIsOnline(device)) {
      this.setState({ carHealth: {} });
      return;
    }

    this.setState({ carHealth: { fetching: true }});
    try {
      const payload = {
        method: 'getMessage',
        params: {'service': 'pandaState', 'timeout': 5000},
        jsonrpc: '2.0',
        id: 0,
      };
      const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
      if (this.mounted && dongleId === this.props.dongleId) {
        this.setState({ carHealth: resp });
      }
    } catch(err) {
      if (this.mounted && dongleId === this.props.dongleId) {
        if (!err.message || err.message.indexOf('Device not registered') === -1) {
          console.log(err);
          Sentry.captureException(err, { fingerprint: 'device_info_athena_pandastate' });
        }
        this.setState({ carHealth: { error: err.message }});
      }
    }
  }

  async takeSnapshot() {
    const { dongleId } = this.props;
    const { snapshot } = this.state;
    this.setState({ snapshot: { ...snapshot, error: null, fetching: true }});
    try {
      const payload = {
        method: "takeSnapshot",
        jsonrpc: "2.0",
        id: 0,
      };
      let resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
      if (resp.result && !resp.result.jpegBack && !resp.result.jpegFront) {
        resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
      }
      if (resp.result && !resp.result.jpegBack && !resp.result.jpegFront) {
        throw new Error('unable to fetch snapshot');
      }
      if (dongleId === this.props.dongleId) {
        this.setState({ snapshot: resp });
      }
    } catch(err) {
      let error = err.message;
      if (error.indexOf('Device not registered') !== -1) {
        error = 'device offline'
      } else {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'device_info_snapshot' });
        if (error.length > 5 && error[5] === '{') {
          try {
            error = JSON.parse(error.substr(5)).error;
          } catch { }
        }
      }
      this.setState({ snapshot: { error: error }});
    }
  }

  snapshotType(showFront) {
    const { snapshot } = this.state;
    this.setState({ snapshot: { ...snapshot, showFront }});
  }

  render() {
    const { classes, device } = this.props;
    const { snapshot, deviceStats, windowWidth } = this.state;

    const containerPadding = windowWidth > 520 ? 36 : 16;
    const largeSnapshotPadding = windowWidth > 1440 ? '12px 0' : 0;

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <VisibilityHandler onVisible={ this.onVisible } onInit={ true } onDongleId={ true } minInterval={ 60 } />
        <div className={ classes.container } style={{ paddingLeft: containerPadding, paddingRight: containerPadding }}>
          { windowWidth >= 768 ?
            <div className={ classes.row }>
              <Typography variant="title">{ device.alias || deviceTypePretty(device.device_type) }</Typography>
              { this.renderStats() }
              { this.renderButtons() }
            </div>
          : <>
            <div className={ classes.row }>
              <Typography variant="title">{ device.alias || deviceTypePretty(device.device_type) }</Typography>
              { this.renderButtons() }
            </div>
            { deviceStats.result &&
              <div className={ `${classes.row} ${classes.spaceAround}` }>
                { this.renderStats() }
              </div>
            }
          </> }
        </div>
        { snapshot.result &&
          <div className={ classes.snapshotContainer }>
            { windowWidth >= 640 ?
              <div className={ classes.snapshotContainerLarge } style={{ padding: largeSnapshotPadding }}>
                <div className={ classes.snapshotImageContainerLarge }>
                  { this.renderSnapshotImage(snapshot.result.jpegBack, false) }
                </div>
                <div className={ classes.snapshotImageContainerLarge }>
                  { this.renderSnapshotImage(snapshot.result.jpegFront, true) }
                </div>
              </div>
            :
              <Carousel autoPlay={ false } interval={ 2147483647 } showThumbs={ false } showStatus={ false }
                showArrows={ false }>
                { this.renderSnapshotImage(snapshot.result.jpegBack, false) }
                { this.renderSnapshotImage(snapshot.result.jpegFront, true) }
              </Carousel>
            }
          </div>
        }
      </>
    );
  }

  renderStats() {
    const { classes } = this.props;
    const { deviceStats } = this.state;

    if (!deviceStats.result) {
      return <>
        <div></div>
        <div></div>
        <div></div>
      </>;
    }

    return (
      <>
        <div className={ classes.deviceStat }>
          <Typography variant="subheading" className={ classes.bold }>
            { Math.round(deviceStats.result.all.distance) }
          </Typography>
          <Typography variant="subheading">miles</Typography>
        </div>
        <div className={ classes.deviceStat }>
          <Typography variant="subheading" className={ classes.bold }>
            { deviceStats.result.all.routes }
          </Typography>
          <Typography variant="subheading">drives</Typography>
        </div>
        <div className={ classes.deviceStat }>
          <Typography variant="subheading" className={ classes.bold }>
            { Math.round(deviceStats.result.all.minutes / 60.0) }
          </Typography>
          <Typography variant="subheading">hours</Typography>
        </div>
      </>
    );
  }

  renderButtons() {
    const { classes, device } = this.props;
    const { snapshot, carHealth, windowWidth } = this.state;

    let batteryVoltage;
    let batteryBackground = Colors.grey400;
    if (deviceIsOnline(device) && carHealth.result && carHealth.result.pandaState &&
      carHealth.result.pandaState.voltage)
    {
      batteryVoltage = carHealth.result.pandaState.voltage / 1000.0;
      batteryBackground = batteryVoltage < 11.0 ? Colors.red400: Colors.green400;
    }

    const buttonClass = windowWidth >= 520 ? classes.snapshotButton : classes.snapshotButtonSmall;
    const buttonOffline = deviceIsOnline(device) ? '' : classes.buttonOffline;

    return (
      <>
        <div className={ classes.carBattery } style={{ backgroundColor: batteryBackground }}>
          <Typography>
            { deviceIsOnline(device) ?
              (windowWidth >= 520 ? 'car ' : '') +
              'battery: ' +
              (batteryVoltage ? batteryVoltage.toFixed(1) + '\u00a0V' : 'N/A')
            :
              'device offline'
            }
          </Typography>
        </div>
        <div ref={ this.snapshotButtonRef }>
          <Button onClick={ this.takeSnapshot } disabled={ Boolean(snapshot.fetching || !deviceIsOnline(device)) }
            classes={{ root: `${classes.button} ${buttonClass} ${buttonOffline}` }}>
            { snapshot.fetching ?
              <CircularProgress size={ 19 } /> :
              'take snapshot'
            }
          </Button>
        </div>
        <Popper open={ Boolean(snapshot.error) } placement="bottom"
          anchorEl={ this.snapshotButtonRef.current } className={ classes.snapshotErrorPopover }>
          <Typography>{ snapshot.error }</Typography>
        </Popper>
      </>
    );
  }

  renderSnapshotImage(src, isFront) {
    const { classes } = this.props;
    if (!src) {
      return (
        <div className={ classes.snapshotImageError }>
          <Typography>{ isFront && 'Interior' } snapshot not available</Typography>
          { isFront &&
            <Typography>
              Enable "Record and Upload Driver Camera" on your device for interior camera snapshots
            </Typography>
          }
        </div>
      );
    }

    return ( <img src={ `data:image/jpeg;base64,${src}` } className={ classes.snapshotImage } /> );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(DeviceInfo));
