import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';

import DriveList from './DriveList';

const styles = (/* theme */) => ({
  base: {
    background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
    display: 'flex',
    overflow: 'hidden',
    flexGrow: 0,
    minWidth: '100%',
    flexWrap: 'wrap',
  },
  window: {
    display: 'flex',
    flexGrow: 1,
    flexDirection: 'column',
  },
});

class Dashboard extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { classes } = this.props;

    return (
      <div className={classes.base}>
        <div className={classes.window}>
          <DriveList />
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  selectedDongleId: 'workerState.dongleId',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));
