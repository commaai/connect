import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

const styles = (/* theme */) => ({
  root: {}
});

class MyAwesomeComponent extends PureComponent {
  render() {
    return (
      <>
        <Typography>asdf</Typography>
      </>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(MyAwesomeComponent));
