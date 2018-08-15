import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import window from 'global/window';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import { oauthRedirectLink } from '../api/auth';
import { CommaIcon } from '../icons';

const styles = theme => {
  return {
    root: {
      maxWidth: '560px',
      height: '60px',
      width: '100%',
      height: '100%',
      marginTop: '30vh',
      margin: '0 auto',
      textAlign: 'left'
    },
    top: {
    },
    title: {
      display: 'inline',
      lineHeight: '60px',
      fontSize: '24px',
      verticalAlign: 'top'
    },
    tagline: {
      padding: '10px 0 20px 0',
      fontSize: '18px',
    },
    logInButton: {
      width: '100%',
      background: '#175886',
      border: '1px solid #000000',
      borderRadius: '100px',
      fontSize: '21px',
      height: '80px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    },
    logInLink: {
      textDecoration: 'none',
    },
    logInText: {
      fontSize: '24px',
    }
  }
};

class AnonymousLanding extends Component {
  componentWillMount () {
    if (typeof window.sessionStorage !== 'undefined') {
      sessionStorage.redirectURL = this.props.pathname;
    }
  }
  render () {
    return (
      <Grid container alignItems='center' justify='center' className={ this.props.classes.root }>
        <Grid item xs={12}>
          <Typography paragraph={false} className={ this.props.classes.title }>
            <CommaIcon style={{ fontSize: '2em' }} />
            explorer
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <Typography className={ this.props.classes.tagline }>Review and annotate your comma.ai driving data</Typography>
        </Grid>
        <Grid item xs={12}>
          <a href={ oauthRedirectLink } className={ this.props.classes.logInLink }>
            <div className={ this.props.classes.logInButton }>
              <Typography className={ this.props.classes.logInText }>Log in with Google</Typography>
            </div>
          </a>
        </Grid>
      </Grid>
    );
  }
}

const stateToProps = Obstruction({
  pathname: 'router.location.pathname'
});

export default connect(stateToProps)(withStyles(styles)(AnonymousLanding));
