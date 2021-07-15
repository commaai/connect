import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, Typography, Button } from '@material-ui/core';

import { primeNav } from '../../actions';
import PrimeChecklist from './PrimeChecklist';
import Colors from '../../colors';

const styles = () => ({
  primeContainer: {
    padding: 16,
    borderBottom: `1px solid ${Colors.white10}`,
    color: '#fff',
  },
  introLine: {
    display: 'inline',
    lineHeight: '23px',
  },
  checkList: {
    marginLeft: 10,
    marginBottom: 10,
  },
  checkListItem: {
    padding: '5px 0',
    '& svg': { margin: 0 },
  },
  moreInfoButton: {
    borderRadius: 30,
    minHeight: 'unset',
    padding: '2px 8px',
    marginLeft: '15px',
    display: 'inline',
  },
  activateButton: {
    background: '#fff',
    borderRadius: 30,
    color: '#404B4F',
    textTransform: 'none',
    width: 300,
    maxWidth: '100%',
    '&:hover': {
      background: '#fff',
      color: '#404B4F',
    }
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
        <Typography classes={{ root: classes.introLine }}>
          Become a comma prime member today for only $24/month
        </Typography>
        { this.state.moreInfo ? <>
          <PrimeChecklist />
          <Button size="large" className={ classes.activateButton }
            onClick={ () => this.props.dispatch(primeNav()) }>
            Activate comma prime
          </Button>
        </> :
          <Button onClick={ () => this.setState({ moreInfo: true }) } className={ classes.moreInfoButton }>
            More info
          </Button>
        }
      </div>
    );
  }
}

const stateToProps = Obstruction({});

export default connect(stateToProps)(withStyles(styles)(PrimeBanner));
