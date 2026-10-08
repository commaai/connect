import React, { Component, lazy, Suspense } from 'react';
import { connect, Provider } from 'react-redux';
import { Redirect } from 'react-router-dom';
import { ConnectedRouter } from 'connected-react-router';
import localforage from 'localforage';
import * as Sentry from '@sentry/react';

import MyCommaAuth, { config as AuthConfig, storage as AuthStorage } from '@commaai/my-comma-auth';
import { athena as Athena, billing as Billing, request as Request } from './api';
import { api, initBackend } from './api/backend';

import { parseLocation } from './url';
import { webrtcConnectionManager } from './utils/webrtc';
import { fetchTurnCredentials } from './utils/turn';
import defaultStore, { history as defaultHistory } from './store';

import ErrorFallback from './components/ErrorFallback';
import FullPageLoading from './components/FullPageLoading';

const Explorer = lazy(() => import('./components/explorer'));
const AnonymousLanding = lazy(() => import('./components/anonymous'));

const AppRoutes = connect((state) => ({ navigation: state.navigation }))(({ navigation, redirectTo }) => {
  const authenticated = api.auth.isAuthenticated();
  if (navigation.page === 'auth') return <Redirect to={authenticated ? redirectTo : '/'} />;
  const publicDrive = ['drive', 'legacy'].includes(navigation.page);
  return authenticated || publicDrive ? <Explorer /> : <AnonymousLanding />;
});

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      initialized: false,
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
    const { history = defaultHistory } = this.props;
    initBackend(history.location.pathname);

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
    if (token) {
      Request.configure(token, this.apiErrorResponseCallback);
      Billing.configure(token, this.apiErrorResponseCallback);
      Athena.configure(token, this.apiErrorResponseCallback);

      // Reloading: start the webrtc handshake as soon as the API is authed, so it runs in parallel
      // with the lazy explorer chunk load and redux/device init instead of behind them.
      const navigation = parseLocation(history.location);
      if (navigation.page === 'stream') {
        webrtcConnectionManager.reconnect(navigation.dongleId);
      }

      fetchTurnCredentials().catch((err) => {
        console.error('Failed to fetch TURN credentials', err);
        Sentry.captureException(err, { fingerprint: 'app_fetch_turn_credentials' });
      });
    }

    this.setState({
      initialized: true,
      redirectTo: api.auth.isAuthenticated() && parseLocation(history.location).page === 'auth' ? this.redirectLink() : '/',
    });
  }

  redirectLink() {
    let url = '/';
    if (typeof window.sessionStorage !== 'undefined' && sessionStorage.getItem('redirectURL') !== null) {
      url = sessionStorage.getItem('redirectURL');
      sessionStorage.removeItem('redirectURL');
    }
    return url;
  }

  render() {
    if (!this.state.initialized) {
      return <FullPageLoading />;
    }

    const { store = defaultStore, history = defaultHistory } = this.props;
    let content = (
      <Suspense fallback={<FullPageLoading />}>
        <AppRoutes redirectTo={this.state.redirectTo} />
      </Suspense>
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
