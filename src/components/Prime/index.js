import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import PrimeIntro from './PrimeIntro';
import PrimeManage from './PrimeManage';

import {
  withStyles,
  Typography,
  Button,
} from '@material-ui/core';

const styles = () => ({
});

class Prime extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { prime } = this.props;
    switch (prime.nav) {
    case 'intro':
      return ( <PrimeIntro /> );
    case 'manage':
      return ( <PrimeManage /> );
    }
  }
}

const stateToProps = Obstruction({
  prime: 'prime',
});

export default connect(stateToProps)(withStyles(styles)(Prime));
