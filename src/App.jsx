import React, { Component, lazy, Suspense } from 'react';
import { Provider } from 'react-redux';
import { Route, Switch, Redirect } from 'react-router-dom';
import { ConnectedRouter } from 'connected-react-router';
import localforage from 'localforage';
import * as Sentry from '@sentry/react';

import MyCommaAuth, { config as AuthConfig, storage as AuthStorage } from '@commaai/my-comma-auth';
import { athena as Athena, billing as Billing, request as Request } from './api';
import { api, initBackend } from './api/backend';

import { build, parse } from './location';
import { webrtcConnectionManager } from './utils/webrtc';
import { fetchTurnCredentials } from './utils/turn';
import defaultStore, { history as defaultHistory } from './store';

import ErrorFallback from './components/ErrorFallback';
import FullPageLoading from './components/FullPageLoading';

const Explorer = lazy(() => import('./components/explorer'));
const AnonymousLanding = lazy(() => import('./components/anonymous'));

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      initialized: false,
    };

    const { history: bootHistory = defaultHistory } = this.props;
    const bootLocation = parse(bootHistory.location);
    if (bootLocation.passthrough.pair) {
      try {
        localforage.setItem('pairToken', bootLocation.passthrough.pair);
      } catch (err) {
        console.error(err);
      }
      // the token is consumed: strip it so a reload never re-pairs and a
      // shared link never carries it
      bootHistory.replace(build({
        ...bootLocation,
        passthrough: { ...bootLocation.passthrough, pair: null },
      }));
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

    const { history: bootHistory = defaultHistory } = this.props;
    if (bootHistory.location.pathname === AuthConfig.AUTH_PATH) {
      try {
        const { code, provider } = parse(bootHistory.location);
        const token = await api.auth.refreshAccessToken(code, provider);
        if (token) {
          AuthStorage.setCommaAccessToken(token);
          localStorage.setItem('lastLoginProvider', provider);
        }
      } catch (err) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'app_auth_refresh_token' });
      }
    }

    const token = await MyCommaAuth.init();
    if (token) {
      Request.configure(token, this.apiErrorResponseCallback);
      Billing.configure(token, this.apiErrorResponseCallback);
      Athena.configure(token, this.apiErrorResponseCallback);

      // Reloading: start the webrtc handshake as soon as the API is authed, so it runs in parallel
      // with the lazy explorer chunk load and redux/device init instead of behind them.
      const location = parse(bootHistory.location);
      if (location.kind === 'stream') {
        webrtcConnectionManager.reconnect(location.dongleId);
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
    if (typeof window.sessionStorage !== 'undefined' && sessionStorage.getItem('redirectURL') !== null) {
      url = sessionStorage.getItem('redirectURL');
      sessionStorage.removeItem('redirectURL');
    }
    return url;
  }

  authRoutes() {
    return (
      <Switch>
        <Route path="/auth/">
          <Redirect to={this.redirectLink()} />
        </Route>
        <Route path="/" component={Explorer} />
      </Switch>
    );
  }

  anonymousRoutes() {
    return (
      <Switch>
        <Route path="/auth/">
          <Redirect to="/" />
        </Route>
        <Route path="/" component={AnonymousLanding} />
      </Switch>
    );
  }

  render() {
    if (!this.state.initialized) {
      return <FullPageLoading />;
    }

    const { store = defaultStore, history = defaultHistory } = this.props;
    const location = parse(history.location);
    const anonymousOk = location.kind === 'drive' || location.kind === 'legacy';
    const showLogin = !api.auth.isAuthenticated() && !anonymousOk;
    let content = (
      <Suspense fallback={<FullPageLoading />}>
        { showLogin ? this.anonymousRoutes() : this.authRoutes() }
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
