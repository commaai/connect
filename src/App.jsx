import React, { Component, lazy, Suspense } from 'react';
import { Provider } from 'react-redux';
import { Route, Switch, Redirect, useLocation } from 'react-router-dom';
import { ConnectedRouter } from 'connected-react-router';
import localforage from 'localforage';
import * as Sentry from '@sentry/react';

import MyCommaAuth, { config as AuthConfig, storage as AuthStorage } from '@commaai/my-comma-auth';
import { athena as Athena, billing as Billing, request as Request } from './api';
import { api, initBackend } from './api/backend';

import { parseUrl, sameOriginPath } from './url';
import { webrtcConnectionManager } from './utils/webrtc';
import { fetchTurnCredentials } from './utils/turn';
import defaultStore, { history as defaultHistory } from './store';

import ErrorFallback from './components/ErrorFallback';
import FullPageLoading from './components/FullPageLoading';

const Explorer = lazy(() => import('./components/explorer'));
const AnonymousLanding = lazy(() => import('./components/anonymous'));

function AppRoutes({ authenticated, redirectLink }) {
  const location = useLocation();
  const page = parseUrl(location).page;
  const showLogin = !authenticated && page !== 'drive' && page !== 'legacy';
  return (
    <Suspense fallback={<FullPageLoading />}>
      <Switch>
        <Route
          path="/auth/"
          render={() => <Redirect to={showLogin ? '/' : redirectLink()} />}
        />
        <Route path="/" component={showLogin ? AnonymousLanding : Explorer} />
      </Switch>
    </Suspense>
  );
}

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      initialized: false,
    };

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

    const currentUrl = new URL(window.location.href);
    const pairToken = currentUrl.searchParams.get('pair');
    if (pairToken) {
      try {
        await localforage.setItem('pairToken', pairToken);
        currentUrl.searchParams.delete('pair');
        const history = this.props.history || defaultHistory;
        history.replace(`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      } catch (err) {
        console.error(err);
      }
    }

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
      const location = parseUrl(window.location);
      const teleopDongleId = location.dongleId;
      if (teleopDongleId && location.page === 'stream') {
        webrtcConnectionManager.reconnect(teleopDongleId);
      }

      fetchTurnCredentials().catch((err) => {
        console.error('Failed to fetch TURN credentials', err);
        Sentry.captureException(err, { fingerprint: 'app_fetch_turn_credentials' });
      });
    }

    this.setState({ initialized: true });
  }

  redirectLink() {
    let url = '/';
    if (typeof window.sessionStorage !== 'undefined') {
      const saved = sessionStorage.getItem('redirectURL');
      sessionStorage.removeItem('redirectURL');
      url = sameOriginPath(saved) || '/';
    }
    return url;
  }

  render() {
    if (!this.state.initialized) {
      return <FullPageLoading />;
    }

    const { store = defaultStore, history = defaultHistory } = this.props;
    let content = <AppRoutes authenticated={api.auth.isAuthenticated()} redirectLink={() => this.redirectLink()} />;

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
