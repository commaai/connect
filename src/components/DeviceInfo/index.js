import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, Typography } from '@material-ui/core';

import Colors from '../../colors';
import { deviceTypePretty } from '../../utils'
import { devices as DevicesApi, athena as AthenaApi } from '@commaai/comma-api';

const styles = () => ({
  container: {
    borderBottom: `1px solid ${Colors.white10}`,
    padding: '16px 36px',
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
      this.takeSnapshot();
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

    return (
      <div className={ classes.container }>
        <Typography variant="title">{ device.alias || deviceTypePretty(device.device_type) }</Typography>
        { deviceStats && deviceStats.result &&
          <div>
            <Typography variant="subheading">stats</Typography>
            { JSON.stringify(deviceStats) }
          </div>
        }
        { snapshot && snapshot.result &&
          <div>
            <Typography variant="subheading">snapshot</Typography>
            { JSON.stringify(snapshot) }
          </div>
        }
        { carHealth && carHealth.result &&
          <div>
            <Typography variant="subheading">car health</Typography>
            { JSON.stringify(carHealth) }
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
