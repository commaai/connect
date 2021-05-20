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

const styles = (/* theme */) => ({
  baseContainer: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  base: {
    overflowY: 'auto',
    margin: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  logo: {
    display: 'flex',
  },
  logoImg: {
    height: 45,
    marginRight: 20,
    width: 'auto',
  },
  logoText: {
    fontSize: 24,
    fontWeight: 800,
  },
  tagline: {
    margin: '20px 0 52px',
    fontSize: '18px',
  },
  logInButton: {
    alignItems: 'center',
    background: '#ffffff',
    display: 'flex',
    borderRadius: '100px',
    fontSize: '21px',
    height: '80px',
    justifyContent: 'center',
    textDecoration: 'none',
    width: '100%',
    marginBottom: '0.5em',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'left 15% center',
    backgroundSize: '40px',
  },
  logInText: {
    fontSize: '18px',
    color: 'black',
    fontWeight: 600,
  },
  demoLink: {
    textDecoration: 'none',
    justifyContent: 'center',
    width: '100%',
    height: '40px',
    display: 'flex',
  },
  demoLinkText: {
    fontSize: '18px',
  },
});

const DEMO_LINK = `${window.location.origin}/?demo=1`;

class AnonymousLanding extends Component {
  componentWillMount() {
    if (typeof window.sessionStorage !== 'undefined') {
      const { pathname } = this.props;
      sessionStorage.redirectURL = pathname;
    }
  }

  componentDidMount() {
    const script = document.createElement("script");
    document.body.appendChild(script);
    script.onload = () => {
      AppleID.auth.init({
        clientId : AuthConfig.APPLE_CLIENT_ID,
        scope : AuthConfig.APPLE_SCOPES,
        redirectURI : AuthConfig.APPLE_REDIRECT_URI,
        usePopup : true,
      });
    };
    script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    document.addEventListener('AppleIDSignInOnSuccess', (data) => {
      window.location = [AuthConfig.APPLE_REDIRECT_PATH,
        qs.stringify({code: data.detail.authorization.code})].join('?');
    });
  }

  render() {
    const { classes } = this.props;
    return (
      <div className={ classes.baseContainer }>
        <div className={classes.base}>
          <div className={classes.logo}>
            <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
            <Typography className={classes.logoText}>explorer</Typography>
          </div>
          <Typography className={classes.tagline}>
            View your comma.ai devices and driving data.
          </Typography>
          <a href={AuthConfig.GOOGLE_REDIRECT_LINK}
            className={classes.logInButton}
            style={{backgroundImage: "url(" + auth_google + ")"}}>
            <Typography className={classes.logInText}>
              Sign in with Google
            </Typography>
          </a>
          <a onClick={ () => AppleID.auth.signIn() }
            className={classes.logInButton}
            style={ { backgroundImage: "url(" + auth_apple + ")", cursor: 'pointer' } }>
            <Typography className={classes.logInText}>
              Sign in with Apple
            </Typography>
          </a>
          <a href={AuthConfig.GITHUB_REDIRECT_LINK}
            className={classes.logInButton}
            style={{backgroundImage: "url(" + auth_github + ")"}}>
            <Typography className={classes.logInText}>
              Sign in with GitHub
            </Typography>
          </a>
          <a href={DEMO_LINK} className={classes.demoLink}>
            <Typography className={classes.demoLinkText}>
              or try the demo
            </Typography>
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
