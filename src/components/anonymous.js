import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import window from 'global/window';
import PropTypes from 'prop-types';
import qs from 'query-string';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import { config as AuthConfig } from '@commaai/my-comma-auth';

import { auth_apple, auth_github, auth_google } from '../icons';
import Colors from '../colors';

const demoDevices = require('../demo/devices.json');

const styles = (/* theme */) => ({
  baseContainer: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  base: {
    overflowY: 'auto',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  logoImg: {
    height: 45,
    width: 'auto',
  },
  logoContainer: {
    width: 84,
    height: 84,
    backgroundColor: Colors.grey900,
    borderRadius: 17,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoSpacer: {
    height: 60,
    flexShrink: 2,
  },
  logoText: {
    fontSize: 36,
    fontWeight: 800,
    textAlign: 'center',
  },
  tagline: {
    width: 380,
    maxWidth: '90%',
    textAlign: 'center',
    margin: '10px 0 30px',
    fontSize: '18px',
  },
  logInButton: {
    cursor: 'pointer',
    alignItems: 'center',
    background: '#ffffff',
    display: 'flex',
    borderRadius: 80,
    fontSize: 21,
    height: 80,
    justifyContent: 'center',
    textDecoration: 'none',
    width: 400,
    maxWidth: '90%',
    marginBottom: 10,
    '&:hover': {
      background: '#eee',
    },
  },
  buttonText: {
    fontSize: 18,
    width: 190,
    textAlign: 'center',
    color: 'black',
    fontWeight: 600,
  },
  buttonImage: {
    height: 40,
  },
  demoLink: {
    textDecoration: 'none',
    justifyContent: 'center',
    height: '40px',
    display: 'flex',
  },
  demoLinkText: {
    textDecoration: 'underline',
    fontSize: '16px',
  },
});

class AnonymousLanding extends Component {
  componentWillMount() {
    if (typeof window.sessionStorage !== 'undefined' && sessionStorage.getItem('redirectURL') === null) {
      sessionStorage.setItem('redirectURL', this.props.pathname);
    }
  }

  componentDidMount() {
    const q = new URLSearchParams(window.location.search);
    if (q.has('r')) {
      sessionStorage.setItem('redirectURL', q.get('r'));
    }

    const script = document.createElement("script");
    document.body.appendChild(script);
    script.onload = () => {
      AppleID.auth.init({
        clientId : AuthConfig.APPLE_CLIENT_ID,
        scope : AuthConfig.APPLE_SCOPES,
        redirectURI : AuthConfig.APPLE_REDIRECT_URI,
        state : AuthConfig.APPLE_STATE,
      });
    };
    script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    document.addEventListener('AppleIDSignInOnSuccess', (data) => {
      const { code, state } = data.detail.authorization;
      window.location = [AuthConfig.APPLE_REDIRECT_PATH, qs.stringify({ code, state })].join('?');
    });
    document.addEventListener('AppleIDSignInOnFailure', console.log);
  }

  render() {
    const { classes } = this.props;

    return (
      <div className={ classes.baseContainer }>
        <div className={ classes.base }>
          <div className={ classes.logoContainer }>
            <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
          </div>
          <div className={ classes.logoSpacer }>&nbsp;</div>
          <Typography className={classes.logoText}>comma connect</Typography>
          <Typography className={classes.tagline}>
            Manage your comma device, view your drives, and comma prime features
          </Typography>
          <a href={ AuthConfig.GOOGLE_REDIRECT_LINK } className={ classes.logInButton }>
            <img className={ classes.buttonImage } src={ auth_google } />
            <Typography className={ classes.buttonText }>Sign in with Google</Typography>
          </a>
          <a onClick={ () => AppleID.auth.signIn() } className={classes.logInButton}>
            <img className={ classes.buttonImage } src={ auth_apple } />
            <Typography className={ classes.buttonText }>Sign in with Apple</Typography>
          </a>
          <a href={ AuthConfig.GITHUB_REDIRECT_LINK } className={ `${classes.logInButton} githubAuth` }>
            <img className={ classes.buttonImage } src={ auth_github } />
            <Typography className={ classes.buttonText }>Sign in with GitHub</Typography>
          </a>
          <a href={ `${window.location.origin}/${demoDevices[0].dongle_id}` } className={classes.demoLink}>
            <Typography className={classes.demoLinkText}>Try the demo</Typography>
          </a>
        </div>
      </div>
    );
  }
}

AnonymousLanding.propTypes = {
  pathname: PropTypes.string.isRequired,
  classes: PropTypes.object.isRequired
};

const stateToProps = Obstruction({
  pathname: 'router.location.pathname'
});

export default connect(stateToProps)(withStyles(styles)(AnonymousLanding));
