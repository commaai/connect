import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, Typography, Button, CircularProgress } from '@material-ui/core';
import "react-responsive-carousel/lib/styles/carousel.min.css"; // requires a loader
import { Carousel } from 'react-responsive-carousel';

import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { deviceTypePretty } from '../../utils'
import { devices as DevicesApi, athena as AthenaApi } from '@commaai/comma-api';

const styles = () => ({
  container: {
    borderBottom: `1px solid ${Colors.white10}`,
    padding: '16px 36px 0 36px',
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    padding: '3px 16px',
    borderRadius: 15,
    '& h3': {
      fontWeight: 500,
    },
  },
  snapshotButton: {
    minWidth: 130,
    padding: '5px 16px',
    borderRadius: 15,
  },
  snapshotContainer: {
    borderBottom: `1px solid ${Colors.white10}`,
  },
  snapshotContainerLarge: {
    display: 'flex',
  },
  snapshotImageContainerLarge: {
    width: '50%',
    display: 'flex',
    justifyContent: 'center',
  },
  snapshotImage: {
    display: 'block',
    width: 'unset !important',
    maxHeight: 302,
    maxWidth: '100%',
  },
  snapshotImageError: {
    maxWidth: 300,
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
});

const initialState = {
  deviceStats: {},
  carHealth: {},
  snapshot: {},
}

class DeviceInfo extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...initialState,
      windowWidth: window.innerWidth,
    };

    this.onResize = this.onResize.bind(this);
    this.fetchDeviceInfo = this.fetchDeviceInfo.bind(this);
    this.fetchDeviceCarHealth = this.fetchDeviceCarHealth.bind(this);
    this.takeSnapshot = this.takeSnapshot.bind(this);
    this.snapshotType = this.snapshotType.bind(this);
    this.renderButtons = this.renderButtons.bind(this);
    this.renderStats = this.renderStats.bind(this);
    this.renderSnapshotImage = this.renderSnapshotImage.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({});
  }

  componentWillUnmount() {

  }

  componentDidUpdate(prevProps, prevState) {
    const { dongleId } = this.props;

    if (prevProps.dongleId !== dongleId) {
      this.setState(initialState);

      this.fetchDeviceInfo();
      this.fetchDeviceCarHealth();
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  async fetchDeviceInfo() {
    const { dongleId } = this.props;
    this.setState({ deviceStats: { fetching: true }});
    try {
      const resp = await DevicesApi.fetchDeviceStats(dongleId);
      this.setState({ deviceStats: { result: resp }});
    } catch(err) {
      this.setState({ deviceStats: { error: err.message }});
    }
  }

  async fetchDeviceCarHealth() {
    const { dongleId } = this.props;
    this.setState({ carHealth: { fetching: true }});
    try {
      const payload = {
        method: 'getMessage',
        params: {'service': 'pandaState', 'timeout': 5000},
        jsonrpc: '2.0',
        id: 0,
      };
      const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
      this.setState({ carHealth: resp });
    } catch(err) {
      this.setState({ carHealth: { error: err.message }});
    }
  }

  async takeSnapshot() {
    const { dongleId } = this.props;
    const { snapshot } = this.state;
    this.setState({ snapshot: { ...snapshot, fetching: true }});
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
      this.setState({ snapshot: resp });
    } catch(err) {
      this.setState({ snapshot: { error: err.message }});
    }
  }

  snapshotType(showFront) {
    const { snapshot } = this.state;
    this.setState({ snapshot: { ...snapshot, showFront }});
  }

  render() {
    const { classes, device } = this.props;
    const { snapshot, windowWidth } = this.state;

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <div className={ classes.container }>
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
            <div className={ `${classes.row} ${classes.spaceAround}` }>
              { this.renderStats() }
            </div>
          </> }
        </div>
        { snapshot.result &&
          <div className={ classes.snapshotContainer }>
            { windowWidth >= 640 ?
              <div className={ classes.snapshotContainerLarge }>
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
      return null;
    }

    return (
      <>
        <div className={ classes.deviceStat }>
          <Typography variant="subheading">{ Math.round(deviceStats.result.all.distance) }</Typography>
          <Typography variant="subheading">miles</Typography>
        </div>
        <div className={ classes.deviceStat }>
          <Typography variant="subheading">{ deviceStats.result.all.routes }</Typography>
          <Typography variant="subheading">drives</Typography>
        </div>
        <div className={ classes.deviceStat }>
          <Typography variant="subheading">{ Math.round(deviceStats.result.all.minutes / 60.0) }</Typography>
          <Typography variant="subheading">hours</Typography>
        </div>
      </>
    );
  }

  renderButtons() {
    const { classes } = this.props;
    const { snapshot, carHealth } = this.state;

    let batteryVoltage;
    let batteryBackground = Colors.grey400;
    if (carHealth.result && carHealth.result.pandaState && carHealth.result.pandaState.voltage) {
      batteryVoltage = carHealth.result.pandaState.voltage / 1000.0;
      batteryBackground = batteryVoltage < 11.0 ? Colors.red400: Colors.green400;
    }

    return (
      <>
        <div className={ classes.carBattery } style={{ backgroundColor: batteryBackground }}>
          <Typography variant="subheading">
            car battery: { batteryVoltage ? batteryVoltage.toFixed(1) + ' V' : 'N/A' }
          </Typography>
        </div>
        <Button onClick={ this.takeSnapshot } disabled={ Boolean(snapshot.fetching) }
          classes={{ root: `${classes.button} ${classes.snapshotButton}` }}>
          { snapshot.fetching ?
            <CircularProgress size={ 19 } /> :
            'take snapshot'
          }
        </Button>
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
