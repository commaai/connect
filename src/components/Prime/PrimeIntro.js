import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';



import {
  withStyles,
  Typography,
  Button,
} from '@material-ui/core';

const styles = () => ({
  primeContainer: {
    padding: 50,
    color: '#fff',
  },
  continueButton: {
    background: '#fff',
    borderRadius: 30,
    color: '#404B4F',
    height: 50,
    textTransform: 'none',
    width: 500,
    '&:hover': {
      background: '#fff',
      color: '#404B4F',
    }
  },
});

class PrimeIntro extends Component {
  constructor(props) {
    super(props);

    this.navPrime = this.navPrime.bind(this);
    this.deviceTypePretty = this.deviceTypePretty.bind(this);
  }

  deviceTypePretty(deviceType) {
    if (deviceType === 'neo') {
      return 'EON';
    } else if (deviceType === 'two') {
      return 'comma two';
    }
    return deviceType;
  }

  navPrime() {
    primeNav('payment');
    this.props.dispatch({ Types.PR, prime.nav: 'payment' });
  }

  render() {
    const { classes, dongleId, devices } = this.props;
    let device = null
    devices.forEach(d => {
      console.log(d, dongleId);
      if (d.dongle_id === dongleId) {
        device = d;
      }
    });

    const alias = device.alias || this.deviceTypePretty(device.device_type);

    return (
      <div className={ classes.primeContainer }>
        <Typography variant="title">comma prime</Typography>
        <Typography variant="body2">
          { alias }
        </Typography>
        <Typography variant="caption">
          ({ device.dongle_id })
        </Typography>
        <p>Become a comma prime member today for only $24/month</p>
        <ul>
          <li>Real-time car location</li>
          <li>Take pictures remotely</li>
          <li>1 year storage of drive videos</li>
          <li>Simple SSH for developers</li>
          <li>24/7 connectivity</li>
          <li>Unlimited data at 512kbps*</li>
        </ul>
        <Button size="large" variant="outlined" className={ classes.continueButton } onClick={ this.navPrime }>
          Activate comma prime
        </Button>
        <p>* Data plan only offered in United States</p>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  devices: 'workerState.devices',
});

export default connect(stateToProps)(withStyles(styles)(PrimeIntro));
