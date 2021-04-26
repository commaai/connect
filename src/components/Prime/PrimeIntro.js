import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { deviceTypePretty } from '../../utils';

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
  }

  navPrime() {
    ;
  }

  render() {
    const { classes, device } = this.props;

    const alias = device.alias || deviceTypePretty(device.device_type);

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
        <Button size="large" variant="outlined" className={ classes.continueButton }
          onClick={ () => primeNav('payment') }>
          Activate comma prime
        </Button>
        <p>* Data plan only offered in United States</p>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(PrimeIntro));
