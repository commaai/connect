import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import PrimeManage from './PrimeManage';
import PrimeOverview from './PrimeOverview';

class Prime extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    if (!this.props.device.is_owner) {
      return ( <></> );
    }
    if (this.props.subscription) {
      return ( <PrimeManage /> );
    }
    return ( <PrimeOverview /> );
  }
}

const stateToProps = Obstruction({
  subscription: 'workerState.subscription',
  device: 'workerState.device',
});

export default connect(stateToProps)(Prime);
