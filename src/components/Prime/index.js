import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import PrimeManage from './PrimeManage';
import PrimeCheckout from './PrimeCheckout';
import { Typography } from '@material-ui/core';

class Prime extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    if (!this.props.device.is_owner && !this.props.isSuperUser) {
      return ( <Typography>No access</Typography> );
    }
    if (this.props.device.prime) {
      return ( <PrimeManage /> );
    }
    return ( <PrimeCheckout /> );
  }
}

const stateToProps = Obstruction({
  subscription: 'workerState.subscription',
  device: 'workerState.device',
  isSuperUser: 'workerState.profile.superuser',
});

export default connect(stateToProps)(Prime);
