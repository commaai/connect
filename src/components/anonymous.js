import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import window from 'global/window';
import PropTypes from 'prop-types';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import { config as AuthConfig } from '@commaai/my-comma-auth';

import { CommaIcon, auth_apple, auth_github, auth_google } from '../icons';

const styles = (/* theme */) => ({
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
    fontFamily: 'MaisonNeue',
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

  render() {
    const { classes } = this.props;
    return (
      <div className={classes.base}>
        <Typography className={classes.title}>
          <CommaIcon style={{ fontSize: '2em' }} />
          explorer
        </Typography>
        <Typography className={classes.tagline}>
          Review and annotate your comma.ai driving data.
        </Typography>
        <a href={AuthConfig.GOOGLE_REDIRECT_LINK} 
           className={classes.logInButton}
           style={{backgroundImage: "url(" + auth_google + ")"}}>
          <Typography className={classes.logInText}>
            Sign in with Google
          </Typography>
        </a>
        <a href={AuthConfig.APPLE_REDIRECT_LINK}
           className={classes.logInButton}
           style={{backgroundImage: "url(" + auth_apple + ")"}}>
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
