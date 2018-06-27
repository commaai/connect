import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import { oauthRedirectLink } from '../api/auth';

const styles = theme => {
  return {
    root: {}
  }
};

class AnonymousLanding extends Component {
  render () {
    return (
      <Grid container alignItems='center' style={{ width: '100%', height: '100%', marginTop: '30vh' }}>
        <Grid item align='center' xs={12} >
          <a href={ oauthRedirectLink }>
            <Typography variant='title'>Sign in</Typography>
          </a>
        </Grid>
      </Grid>
    );
  }
}

export default withStyles(styles)(AnonymousLanding);
