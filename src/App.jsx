import React, { Component, lazy, Suspense } from 'react';
import { Provider, connect } from 'react-redux';
import { Route, Switch, Redirect } from 'react-router-dom';
import { ConnectedRouter } from 'connected-react-router';
import localforage from 'localforage';
import * as Sentry from '@sentry/react';

import MyCommaAuth, { config as AuthConfig, storage as AuthStorage } from '@commaai/my-comma-auth';
import { athena as Athena, billing as Billing, request as Request } from './api';
import { api, initBackend } from './api/backend';

import { isPublic, localPath, destinationFromUrl } from './url';
import { webrtcConnectionManager } from './utils/webrtc';
import { fetchTurnCredentials } from './utils/turn';
import defaultStore, { history as defaultHistory } from './store';

import ErrorFallback from './components/ErrorFallback';
import FullPageLoading from './components/FullPageLoading';

const Explorer = lazy(() => import('./components/explorer'));
const AnonymousLanding = lazy(() => import('./components/anonymous'));

const Page = connect((state) => ({ nav: state.nav }))(({ nav }) => {
  if (nav.page === 'not-found') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-xl font-medium">Page not found</h1>
        <a href="/" className="underline">Go to connect</a>
      </div>
    );
  }
  // keyed per side: react-redux 5 breaks if suspense hides a connected tree
  const showApp = api.auth.isAuthenticated() || isPublic(nav);
  return (
    <Suspense key={showApp ? 'app' : 'sign-in'} fallback={<FullPageLoading />}>
      {showApp ? <Explorer /> : <AnonymousLanding />}
    </Suspense>
  );
});

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      initialized: false,
      returnTo: '/',
    };

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
  }

  apiErrorResponseCallback(resp) {
    if (resp.status === 401) {
      MyCommaAuth.logOut();
    }
  }

  async componentDidMount() {
    // Select the API backend once during startup: /demo gets the demo backend,
    // everything else the real backend.
    initBackend();

    if (window.location) {
      if (window.location.pathname === AuthConfig.AUTH_PATH) {
        try {
          const authParams = new URLSearchParams(window.location.search);
          const provider = authParams.get('provider');
          const token = await api.auth.refreshAccessToken(authParams.get('code'), provider);
          if (token) {
            AuthStorage.setCommaAccessToken(token);
            localStorage.setItem('lastLoginProvider', provider);
          }
        } catch (err) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'app_auth_refresh_token' });
        }
      }
    }

    const token = await MyCommaAuth.init();
    if (token && window.location?.pathname === AuthConfig.AUTH_PATH) { // a failed sign in keeps it
      this.setState({ returnTo: localPath(sessionStorage.getItem('redirectURL')) || '/' });
      sessionStorage.removeItem('redirectURL');
    }
    if (token) {
      Request.configure(token, this.apiErrorResponseCallback);
      Billing.configure(token, this.apiErrorResponseCallback);
      Athena.configure(token, this.apiErrorResponseCallback);

      // Reloading: start the webrtc handshake as soon as the API is authed, so it runs in parallel
      // with the lazy explorer chunk load and redux/device init instead of behind them.
      const nav = destinationFromUrl(window.location);
      if (nav.page === 'stream') {
        webrtcConnectionManager.reconnect(nav.dongleId);
      }

      fetchTurnCredentials().catch((err) => {
        console.error('Failed to fetch TURN credentials', err);
        Sentry.captureException(err, { fingerprint: 'app_fetch_turn_credentials' });
      });
    }

    this.setState({ initialized: true });
  }

  render() {
    if (!this.state.initialized) {
      return <FullPageLoading />;
    }

    const { store = defaultStore, history = defaultHistory } = this.props;
    let content = (
      <Switch>
        <Route path="/auth/">
          <Redirect to={api.auth.isAuthenticated() ? this.state.returnTo : '/'} />
        </Route>
        <Route path="/" component={Page} />
      </Switch>
    );

    // Use ErrorBoundary in production only
    if (import.meta.env.PROD) {
      content = (
        <Sentry.ErrorBoundary fallback={(props) => <ErrorFallback {...props} />}>
          {content}
        </Sentry.ErrorBoundary>
      );
    }

    return (
      <Provider store={store}>
        <ConnectedRouter history={history}>
          {content}
        </ConnectedRouter>
      </Provider>
    );
  }
}

export default App;
