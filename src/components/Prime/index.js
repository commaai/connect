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
    if (this.props.prime) {
      return ( <PrimeManage /> );
    }
    return ( <PrimeOverview /> );
  }
}

const stateToProps = Obstruction({
  prime: 'workersState.device.prime',
});

export default connect(stateToProps)(Prime);
