import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

const styles = theme => {
  return {
    root: {
      paddingTop: '48px'
    },
    eon: {
      display: 'block',
      width: '100%',
    }
  }
};

class EonUpsell extends Component {
  render () {
    return (
      <Grid container xs={12} className={ this.props.classes.root }>
        <Grid item xs={6}>
          <img src='https://comma.ai/eon-offroad-transparent-01.png'
               className={ this.props.classes.eon } />
        </Grid>
        <Grid item xs={6} justify='center' alignItems='center'>
          <Grid item xs={12}>
            <Typography>upgrade to an EON and help improve openpilot</Typography>
          </Grid>
        </Grid>
      </Grid>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(EonUpsell));
