import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

const styles = theme => {
  root: {}
};

class MyAwesomeComponent extends Component {
  render () {
    return (
      <React.Fragment>
        <Typography>asdf</Typography>
      </React.Fragment>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(MyAwesomeComponent));
