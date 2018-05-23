import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import Typography from '@material-ui/core/Typography';

class DeviceList extends Component {
  render () {
    return (
      <div>
        <Typography variant='body1' gutterBottom>
          Device list!
        </Typography>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'wokerState.dongleId'
});

export default connect(stateToProps)(DeviceList);
