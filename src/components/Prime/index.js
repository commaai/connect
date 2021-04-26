import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import PrimeManage from './PrimeManage';
import PrimeActivationPayment from './PrimeActivationPayment';
import PrimeActivationDone from './PrimeActivationDone';

import { withStyles } from '@material-ui/core';

const styles = () => ({
});

class Prime extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { prime } = this.props;
    switch (prime.nav) {
    case 'manage':
      return ( <PrimeManage /> );
    case 'activationPayment':
      return ( <PrimeActivationPayment /> );
    }
  }
}

const stateToProps = Obstruction({
  prime: 'prime',
});

export default connect(stateToProps)(withStyles(styles)(Prime));
