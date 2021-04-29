import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { primeNav } from '../../actions';
import PrimeChecklist from './PrimeChecklist';

import {
  withStyles,
  Typography,
  Button,
} from '@material-ui/core';

const styles = () => ({
  primeContainer: {
    padding: '16px 48px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#fff',
  },
  moreInfoContainer: {
    '& p': { display: 'inline' },
    '& button': { display: 'inline', marginLeft: '15px' },
  },
  introLine: {
    lineHeight: '36px',
  },
  checkList: {
    marginLeft: 10,
    marginBottom: 10,
  },
  checkListItem: {
    padding: '5px 0',
    '& svg': { margin: 0 },
  },
});

class PrimeBanner extends Component {
  constructor(props) {
    super(props);

    this.state = {
      moreInfo: (!props.collapsed),
    };
  }

  render() {
    const { classes } = this.props;

    return (
      <div className={ classes.primeContainer }>
        <Typography variant="title">comma prime</Typography>
        { !this.state.moreInfo && <div className={ classes.moreInfoContainer }>
          <Typography>Become a comma prime member today for only $24/month</Typography>
          <Button onClick={ () => this.setState({ moreInfo: true }) }>More info</Button>
        </div> }
        { this.state.moreInfo && <div>
          <Typography className={ classes.introLine }>Become a comma prime member today for only $24/month</Typography>
          <PrimeChecklist />
          <Button size="large" variant="outlined"
            onClick={ () => this.props.dispatch(primeNav()) }>
            Activate comma prime
          </Button>
        </div> }
      </div>
    );
  }
}

const stateToProps = Obstruction({});

export default connect(stateToProps)(withStyles(styles)(PrimeBanner));
