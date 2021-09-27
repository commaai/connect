import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import qs from 'query-string';

import PrimeManage from './PrimeManage';
import PrimeCheckout from './PrimeCheckout';
import { Typography } from '@material-ui/core';

class Prime extends Component {
  constructor(props) {
    super(props);

    this.state = {
      stripe_cancelled: null,
      stripe_success: null,
    };
  }

  componentDidMount() {
    if (window.location) {
      const params = qs.parse(window.location.search);
      const { stripe_cancelled, stripe_success } = params;
      this.setState({ stripe_cancelled, stripe_success });
    }
  }

  render() {
    const { stripe_cancelled, stripe_success } = this.state;
    if (!this.props.device.is_owner && !this.props.isSuperUser) {
      return ( <Typography>No access</Typography> );
    }
    if (this.props.device.prime || stripe_success) {
      return ( <PrimeManage stripe_success={ stripe_success } /> );
    }
    return ( <PrimeCheckout stripe_cancelled={ stripe_cancelled } /> );
  }
}

const stateToProps = Obstruction({
  subscription: 'workerState.subscription',
  device: 'workerState.device',
  isSuperUser: 'workerState.profile.superuser',
});

export default connect(stateToProps)(Prime);
