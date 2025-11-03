import { athena as Athena, auth as Auth, billing as Billing, request as Request } from '@commaai/api';
import MyCommaAuth, { config as AuthConfig, storage as AuthStorage } from '@commaai/my-comma-auth';
import { CircularProgress, Grid } from '@material-ui/core';
import * as Sentry from '@sentry/react';
import localforage from 'localforage';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { Redirect, Route, Router, Switch } from 'react-router';
import ErrorFallback from './components/ErrorFallback';
import { history } from './history';
import store from './store';
import { getSegmentRange, getZoom } from './url';

const Explorer = lazy(() => import('./components/explorer'));
const AnonymousLanding = lazy(() => import('./components/anonymous'));

const App = () => {
  const [initialized, setInitialized] = useState(false);

  // Handle pair token from URL
  useEffect(() => {
    let pairToken;
    if (window.location) {
      pairToken = new URLSearchParams(window.location.search).get('pair');
    }

    if (pairToken) {
      try {
        localforage.setItem('pairToken', pairToken);
      } catch (err) {
        console.error(err);
      }
    }
  }, []);

  const apiErrorResponseCallback = useCallback((resp) => {
    if (resp.status === 401) {
      MyCommaAuth.logOut();
    }
  }, []);

  // Initialize authentication and API
  useEffect(() => {
    const initialize = async () => {
      if (window.location) {
        if (window.location.pathname === AuthConfig.AUTH_PATH) {
          try {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const provider = params.get('provider');
            const token = await Auth.refreshAccessToken(code, provider);
            if (token) {
              AuthStorage.setCommaAccessToken(token);
            }
          } catch (err) {
            console.error(err);
            Sentry.captureException(err, { fingerprint: 'app_auth_refresh_token' });
          }
        }
      }

      const token = await MyCommaAuth.init();
      if (token) {
        Request.configure(token, apiErrorResponseCallback);
        Billing.configure(token, apiErrorResponseCallback);
        Athena.configure(token, apiErrorResponseCallback);
      }

      setInitialized(true);
    };

    initialize();
  }, [apiErrorResponseCallback]);

  const redirectLink = () => {
    let url = '/';
    if (typeof window.sessionStorage !== 'undefined' && sessionStorage.getItem('redirectURL') !== null) {
      url = sessionStorage.getItem('redirectURL');
      sessionStorage.removeItem('redirectURL');
    }
    return url;
  };

  const authRoutes = () => {
    return (
      <Switch>
        <Route path="/auth/">
          <Redirect to={redirectLink()} />
        </Route>
        <Route path="/" component={Explorer} />
      </Switch>
    );
  };

  const anonymousRoutes = () => {
    return (
      <Switch>
        <Route path="/auth/">
          <Redirect to="/" />
        </Route>
        <Route path="/" component={AnonymousLanding} />
      </Switch>
    );
  };

  const renderLoading = () => {
    return (
      <Grid container alignItems="center" style={{ width: '100%', height: '100vh' }}>
        <Grid item align="center" xs={12}>
          <CircularProgress size="10vh" style={{ color: '#525E66' }} />
        </Grid>
      </Grid>
    );
  };

  if (!initialized) {
    return renderLoading();
  }

  const showLogin = !MyCommaAuth.isAuthenticated() && !getZoom(window.location.pathname) && !getSegmentRange(window.location.pathname);
  let content = <Suspense fallback={renderLoading()}>{showLogin ? anonymousRoutes() : authRoutes()}</Suspense>;

  // Use ErrorBoundary in production only
  if (import.meta.env.PROD) {
    content = <Sentry.ErrorBoundary fallback={(props) => <ErrorFallback {...props} />}>{content}</Sentry.ErrorBoundary>;
  }

  return (
    <Provider store={store}>
      <Router history={history}>{content}</Router>
    </Provider>
  );
};

export default App;
