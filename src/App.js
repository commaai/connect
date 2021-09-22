import React, { Component } from 'react';
import { Provider } from 'react-redux';
import { Route, Switch, Redirect } from 'react-router';
import { ConnectedRouter } from 'connected-react-router';
import document from 'global/document';
import qs from 'query-string';
import localforage from 'localforage';
import * as Sentry from "@sentry/react";

import CircularProgress from '@material-ui/core/CircularProgress';
import Grid from '@material-ui/core/Grid';

import MyCommaAuth, { config as AuthConfig, storage as AuthStorage } from '@commaai/my-comma-auth';
import { auth as AuthApi, request as Request, billing as Billing, athena as Athena } from '@commaai/comma-api';

import Explorer from './components/explorer';
import AnonymousLanding from './components/anonymous';

import TimelineWorker from './timeline';
import { history, createStore } from './store';
import { updateState } from './actions';
import { initGoogleAnalytics } from './analytics';
import * as Demo from './demo';

initGoogleAnalytics(history);
const store = createStore();

TimelineWorker.onStateChange((data) => {
  store.dispatch(updateState(data));
});

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      initialized: false,
      demo: false,
    };

    const pairToken = qs.parse(window.location.search).pair;
    if (pairToken) {
      try {
        localforage.setItem('pairToken', pairToken);
      } catch (err) {
        console.log(err);
      }
    }
  }

  async componentDidMount() {
    const isDemo = await Demo.init();
    if (isDemo) {
      await localforage.setItem('isDemo', '1');
      await TimelineWorker.init(true);
      TimelineWorker.selectTimeRange(1564443025000, Date.now());
      this.setState({
        initialized: true,
        demo: true,
      });
    }

    return await this.auth();
  }

  componentWillUnmount() {
    TimelineWorker.stop();
  }

  async auth() {
    if (document.location) {
      if (document.location.pathname === AuthConfig.AUTH_PATH) {
        try {
          const { code, provider } = qs.parse(document.location.search);
          const token = await AuthApi.refreshAccessToken(code, provider);
          if (token) {
            AuthStorage.setCommaAccessToken(token);
          }
        } catch (err) {
          console.log(err);
          Sentry.captureException(err, { fingerprint: 'app_auth_refresh_token' });
        }
      }
    }

    const token = await MyCommaAuth.init();
    Request.configure(token);
    Billing.configure(token);
    Athena.configure(token);

    if (MyCommaAuth.isAuthenticated()) {
      await TimelineWorker.init();
    }

    this.setState({ initialized: true });
  }

  redirectLink() {
    let url = '/';
    if (typeof window.sessionStorage !== 'undefined') {
      url = sessionStorage.redirectURL || '/';
    }
    return url;
  }

  authRoutes() {
    return (
      <Switch>
        <Route path="/auth/" render={() => <Redirect to={this.redirectLink()} />} />
        <Route path="/" component={Explorer} />
      </Switch>
    );
  }

  ananymousRoutes() {
    return (
      <Switch>
        <Route path="/auth/" render={() => <Redirect to="/" />} />
        <Route path="/" component={AnonymousLanding} />
      </Switch>
    );
  }

  renderLoading() {
    return (
      <Grid container alignItems="center" style={{ width: '100%', height: '100vh' }}>
        <Grid item align="center" xs={12}>
          <CircularProgress size="10vh" style={{ color: '#525E66' }} />
        </Grid>
      </Grid>
    );
  }

  render() {
    if (!this.state.initialized) {
      return this.renderLoading();
    }
    return (
      <Provider store={store}>
        <ConnectedRouter history={history}>
          { (MyCommaAuth.isAuthenticated() || this.state.demo) ? this.authRoutes() : this.ananymousRoutes() }
        </ConnectedRouter>
      </Provider>
    );
  }
}

export default App;
