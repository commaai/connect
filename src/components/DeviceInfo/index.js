import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, Typography, Button } from '@material-ui/core';

import Colors from '../../colors';
import { deviceTypePretty } from '../../utils'
import { devices as DevicesApi, athena as AthenaApi } from '@commaai/comma-api';

const styles = () => ({
  container: {
    borderBottom: `1px solid ${Colors.white10}`,
    padding: '16px 36px',
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: 80,
  },
  carBattery: {
    padding: '0 8px',
    borderRadius: 4,
  },
});

const initialState = {
  deviceStats: null,
  carHealth: null,
  snapshot: null,
}

class DeviceInfo extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...initialState,
    };

    this.fetchDeviceInfo = this.fetchDeviceInfo.bind(this);
    this.fetchDeviceCarHealth = this.fetchDeviceCarHealth.bind(this);
    this.takeSnapshot = this.takeSnapshot.bind(this);
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

  async fetchDeviceInfo() {
    const { dongleId } = this.props;
    this.setState({ deviceStats: { fetching: true }});
    try {
      const resp = await DevicesApi.fetchDeviceStats(dongleId);
      this.setState({ deviceStats: { result: resp }});
    } catch(err) {
      this.setState({ deviceStats: { error: error.message }});
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
    this.setState({ snapshot: { fetching: true }});
    try {
      const payload = {
        method: "takeSnapshot",
        jsonrpc: "2.0",
        id: 0,
      };
      const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
      this.setState({ snapshot: resp });
    } catch(err) {
      this.setState({ snapshot: { error: err.message }});
    }
  }

  render() {
    const { classes, dongleId, device } = this.props;
    const { deviceStats, snapshot, carHealth } = this.state;

    let batteryVoltage;
    if (carHealth && carHealth.result && carHealth.result.pandaState && carHealth.result.pandaState.voltage) {
      batteryVoltage = carHealth.result.pandaState.voltage / 1000.0;
    }

    return (
      <div className={ classes.container }>
        <div className={ classes.row }>
          <Typography variant="title">{ device.alias || deviceTypePretty(device.device_type) }</Typography>

          { deviceStats && deviceStats.result ? <>
            <div className={ classes.deviceStat }>
              <Typography variant="subheading">{ deviceStats.result.all.distance.toFixed(1) }</Typography>
              <Typography variant="subheading">Kilometers</Typography>
            </div>
            <div className={ classes.deviceStat }>
              <Typography variant="subheading">{ deviceStats.result.all.routes }</Typography>
              <Typography variant="subheading">Drives</Typography>
            </div>
            <div className={ classes.deviceStat }>
              <Typography variant="subheading">{ deviceStats.result.all.minutes }</Typography>
              <Typography variant="subheading">Hours</Typography>
            </div>
          </> :
            <Typography variant="subheading">Loading...</Typography>
          }
          <div className={ classes.carBattery }
            style={{ backgroundColor: batteryVoltage < 11.0 ? '#971925': '#178645' }}>
            <Typography variant="subheading" >
              car battery: { batteryVoltage ? batteryVoltage.toFixed(1) + 'v' : 'N/A' }
            </Typography>
          </div>
          <Button onClick={ this.takeSnapshot }>
            take snapshot
          </Button>
        </div>
        { snapshot && snapshot.result &&
          <div className={ classes.row }>
            <Typography variant="subheading">snapshot</Typography>
            <img src={ `data:image/jpeg;base64,${snapshot.result.jpegBack}` } />
            { JSON.stringify(snapshot) }
          </div>
        }
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(DeviceInfo));
