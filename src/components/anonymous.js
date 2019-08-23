import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import window from 'global/window';

import cx from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import { config as AuthConfig } from '@commaai/my-comma-auth';

import { CommaIcon } from '../icons';

const styles = theme => {
  return {
    base: {
      height: '60px',
      margin: '0 auto',
      marginTop: '30vh',
      maxWidth: '560px',
    },
    title: {
      display: 'inline',
      fontFamily: 'MaisonNeueExtended',
      fontSize: '24px',
      fontWeight: 600,
      lineHeight: '60px',
      verticalAlign: 'top',
    },
    tagline: {
      padding: '20px 0 52px',
      fontSize: '18px',
    },
    logInButton: {
      alignItems: 'center',
      background: '#175886',
      display: 'flex',
      borderRadius: '100px',
      fontSize: '21px',
      height: '80px',
      justifyContent: 'center',
      textDecoration: 'none',
      width: '100%',
    },
    logInText: {
      fontFamily: 'MaisonNeue',
      fontSize: '18px',
      fontWeight: 600,
    },
    demoLink: {
      textDecoration: 'none',
      justifyContent: 'center',
      width: '100%',
      height: '40px',
      paddingTop: '10px',
      display: 'flex',
    },
    demoLinkText: {
      fontSize: '18px',
    },
  }
};

const DEMO_LINK = window.location.origin + '/?demo=1';

class AnonymousLanding extends Component {
  componentWillMount () {
    if (typeof window.sessionStorage !== 'undefined') {
      sessionStorage.redirectURL = this.props.pathname;
    }
  }
  render () {
    const { classes } = this.props;
    return (
      <div className={ classes.base }>
        <Typography className={ classes.title }>
          <CommaIcon style={ { fontSize: '2em' } } />
          explorer
        </Typography>
        <Typography className={ classes.tagline }>
          Review and annotate your comma.ai driving data.
        </Typography>
        <a href={ AuthConfig.oauthRedirectLink } className={ classes.logInButton }>
          <Typography className={ classes.logInText }>
            Log in with Google
          </Typography>
        </a>
        <a href={ DEMO_LINK } className={ classes.demoLink }>
          <Typography className={ classes.demoLinkText }>
            or try the demo
          </Typography>
        </a>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  pathname: 'router.location.pathname'
});

export default connect(stateToProps)(withStyles(styles)(AnonymousLanding));
