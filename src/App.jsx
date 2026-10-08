import React, { Component, lazy, Suspense } from 'react';
import { Provider, connect } from 'react-redux';
import { Route, Switch, Redirect } from 'react-router-dom';
import { ConnectedRouter } from 'connected-react-router';
import * as Sentry from '@sentry/react';

import MyCommaAuth, { config as AuthConfig, storage as AuthStorage } from '@commaai/my-comma-auth';
import { athena as Athena, billing as Billing, request as Request } from './api';
import { api, initBackend } from './api/backend';

import { VIEWS, isSafeReturnUrl, parseLocation } from './routing/codec';
import { bootstrapSession } from './actions/session';
import { webrtcConnectionManager } from './utils/webrtc';
import { fetchTurnCredentials } from './utils/turn';
import defaultStore, { history as defaultHistory } from './store';

import ErrorFallback from './components/ErrorFallback';
import FullPageLoading from './components/FullPageLoading';

const Explorer = lazy(() => import('./components/explorer'));
const AnonymousLanding = lazy(() => import('./components/anonymous'));

// re-rendered on every navigation: an anonymous visitor may move between a
// public drive and pages that need a login
const NavigationContent = connect((state) => ({
  view: state.nav?.location?.base.view,
}))(({ view, redirectLink }) => {
  const showLogin = !api.auth.isAuthenticated() && view !== VIEWS.DRIVE && view !== VIEWS.LEGACY_RANGE;
  return (
    <Switch>
      {view === VIEWS.AUTH && (
        <Route exact path={[AuthConfig.AUTH_PATH, AuthConfig.APPLE_REDIRECT_PATH].filter(Boolean)}>
          <Redirect to={showLogin ? '/' : redirectLink()} />
        </Route>
      )}
      <Route path="/" component={showLogin ? AnonymousLanding : Explorer} />
    </Switch>
  );
});

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      initialized: false,
    };
  }

  store() {
    return this.props.store || defaultStore;
  }

  history() {
    return this.props.history || defaultHistory;
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

    const { base, commands } = parseLocation(this.history().location);
    if (base.view === VIEWS.AUTH) {
      if (this.history().location.pathname.replace(/\/$/, '') === AuthConfig.AUTH_PATH.replace(/\/$/, '')) {
        try {
          const { provider } = commands;
          const token = await api.auth.refreshAccessToken(commands.code, provider);
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
      const currentBase = parseLocation(this.history().location).base;
      if (currentBase.view === VIEWS.STREAM) {
        webrtcConnectionManager.reconnect(currentBase.dongleId);
      }

      fetchTurnCredentials().catch((err) => {
        console.error('Failed to fetch TURN credentials', err);
        Sentry.captureException(err, { fingerprint: 'app_fetch_turn_credentials' });
      });
    }

    // profile and device list, independent of which page is open
    this.store().dispatch(bootstrapSession());

    this.setState({ initialized: true });
  }

  redirectLink() {
    let url = '/';
    if (typeof window.sessionStorage !== 'undefined' && sessionStorage.getItem('redirectURL') !== null) {
      url = sessionStorage.getItem('redirectURL');
      sessionStorage.removeItem('redirectURL');
    }
    return isSafeReturnUrl(url) ? url : '/';
  }

  render() {
    if (!this.state.initialized) {
      return <FullPageLoading />;
    }

    const store = this.store();
    const history = this.history();
    let content = (
      <Suspense fallback={<FullPageLoading />}>
        <NavigationContent redirectLink={() => this.redirectLink()} />
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
