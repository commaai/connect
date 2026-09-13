/* global AppleID */
import React, { useEffect } from 'react';
import { connect } from 'react-redux';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import { config as AuthConfig } from '@commaai/my-comma-auth';

import { AuthAppleIcon, AuthGithubIcon, AuthGoogleIcon } from '../icons';
import { stringifyQuery } from '../utils/query';

const AUTH_PROVIDERS = { GOOGLE: 'g', APPLE: 'a', GITHUB: 'h' };

const styles = () => ({
  logInButton: {
    position: 'relative',
    cursor: 'pointer',
    alignItems: 'center',
    background: '#ffffff',
    display: 'flex',
    borderRadius: 80,
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
  lastUsed: {
    position: 'absolute',
    right: 22,
    bottom: -8,
    background: '#e6ebee',
    color: '#4a5861',
    border: '3px solid #1d2225',
    borderRadius: 99,
    padding: '1px 10px',
    fontSize: 11,
    fontWeight: 500,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
});

const AnonymousLanding = ({ classes, pathname }) => {
  useEffect(() => {
    if (typeof window.sessionStorage !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const redirectURL = q.get('r') ?? sessionStorage.getItem('redirectURL') ?? pathname;
      sessionStorage.setItem('redirectURL', redirectURL);
    }

    const handleSuccess = (data) => {
      const { code, state } = data.detail.authorization;
      window.location = `${AuthConfig.APPLE_REDIRECT_PATH}?${stringifyQuery({ code, state })}`;
    };
    const handleFailure = console.warn;

    document.addEventListener('AppleIDSignInOnSuccess', handleSuccess);
    document.addEventListener('AppleIDSignInOnFailure', handleFailure);

    const script = document.createElement('script');
    script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    script.async = true;
    script.onload = () => {
      AppleID.auth.init({
        clientId: AuthConfig.APPLE_CLIENT_ID,
        scope: AuthConfig.APPLE_SCOPES,
        redirectURI: AuthConfig.APPLE_REDIRECT_URI,
        state: AuthConfig.APPLE_STATE,
      });
    };
    document.body.appendChild(script);

    return () => {
      document.removeEventListener('AppleIDSignInOnSuccess', handleSuccess);
      document.removeEventListener('AppleIDSignInOnFailure', handleFailure);
    };
  }, []);

  const lastLoginProvider = localStorage.getItem('lastLoginProvider');

  return (
    <div className="flex flex-col justify-center h-screen">
      <div className="flex flex-col items-center overflow-y-auto p-[20px]">
        <div className="flex h-21 w-21 shrink-0 items-center justify-center rounded-2xl bg-[#1e2224]">
          <img alt="comma" src="/images/comma-white.png" className="h-[45px]" />
        </div>
        <div className="h-[60px] shrink-[2]" />
        <Typography className="text-center text-[36px] font-extrabold">comma connect</Typography>
        <Typography className="mt-[10px] mb-[30px] w-[380px] max-w-[90%] text-center text-[18px]">
          Manage your comma device, view your drives, and use comma prime features
        </Typography>
        <a href={AuthConfig.GOOGLE_REDIRECT_LINK} className={classes.logInButton}>
          <img className="h-10" src={AuthGoogleIcon} alt="" />
          <Typography className="w-[190px] whitespace-nowrap text-center text-[18px] font-semibold text-black">
            Sign in with Google
          </Typography>
          {lastLoginProvider === AUTH_PROVIDERS.GOOGLE && <span className={classes.lastUsed}>Last used</span>}
        </a>
        <a onClick={() => AppleID.auth.signIn()} className={classes.logInButton}>
          <img className="h-10" src={AuthAppleIcon} alt="" />
          <Typography className="w-[190px] whitespace-nowrap text-center text-[18px] font-semibold text-black">
            Sign in with Apple
          </Typography>
          {lastLoginProvider === AUTH_PROVIDERS.APPLE && <span className={classes.lastUsed}>Last used</span>}
        </a>
        <a href={AuthConfig.GITHUB_REDIRECT_LINK} className={`${classes.logInButton} githubAuth`}>
          <img className="h-10" src={AuthGithubIcon} alt="" />
          <Typography className="w-[190px] whitespace-nowrap text-center text-[18px] font-semibold text-black">
            Sign in with GitHub
          </Typography>
          {lastLoginProvider === AUTH_PROVIDERS.GITHUB && <span className={classes.lastUsed}>Last used</span>}
        </a>

        <span className="max-w-sm text-center mt-2 mb-8 text-sm">
          Make sure to sign in with the same account if you have previously
          paired your comma device.
        </span>
      </div>
    </div>
  );
};

const stateToProps = (state) => ({
  pathname: state.router.location.pathname,
});

export default connect(stateToProps)(withStyles(styles)(AnonymousLanding));
