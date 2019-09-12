/* eslint-disable import/no-unresolved */
/* eslint-disable react/jsx-filename-extension */
/* global window sessionStorage */
import React, { Component } from 'react';
import { Provider } from 'react-redux';
import { Route, Switch, Redirect } from 'react-router';
import { ConnectedRouter } from 'connected-react-router';
import document from 'global/document';
import qs from 'query-string';
import localforage from 'localforage';

import CircularProgress from '@material-ui/core/CircularProgress';
import Grid from '@material-ui/core/Grid';

import MyCommaAuth, { config as AuthConfig, storage as AuthStorage } from '@commaai/my-comma-auth';
import { auth as AuthApi, request as Request } from '@commaai/comma-api';

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

const redirectLink = () => {
  let url = '/';
  if (typeof window.sessionStorage !== 'undefined') {
    url = sessionStorage.redirectURL || '/';
  }
  return url;
};

const AuthRoutes = () => (
  <Switch>
    <Route path="/auth/" render={() => <Redirect to={redirectLink} />} />
    <Route path="/" component={Explorer} />
  </Switch>
);

const AnonymousRoutes = () => (
  (
    <Switch>
      <Route path="/auth/" render={() => <Redirect to="/" />} />
      <Route path="/" component={AnonymousLanding} />
    </Switch>
  )
);

const Loading = () => (
  <Grid container alignItems="center" style={{ width: '100%', height: '100%' }}>
    <Grid item align="center" xs={12}>
      <CircularProgress size="10vh" style={{ color: '#525E66' }} />
    </Grid>
  </Grid>
);


class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      initialized: false,
      demo: false,
    };

    Demo.init().then((isDemo) => {
      if (isDemo) {
        return localforage.setItem('isDemo', '1')
          .then(
            TimelineWorker.init(isDemo).then(
              () => {
                TimelineWorker.selectTimeRange(1564443025000, Date.now());
                this.setState({
                  initialized: true,
                  demo: true,
                });
              }
            )
          );
      }
      return this.auth();
    });
  }

  async auth() {
    if (document.location) {
      if (document.location.pathname === '/auth/g/redirect') {
        const { code } = qs.parse(document.location.search);

        try {
          const token = await AuthApi.refreshAccessToken(code, AuthConfig.REDIRECT_URI);
          if (token) {
            AuthStorage.setCommaAccessToken(token);
          }
          // done authing!!
        } catch (e) {
          console.log(e);
        }
      }
    }

    const token = await MyCommaAuth.init();
    Request.configure(token);

    if (MyCommaAuth.isAuthenticated()) {
      await TimelineWorker.init();
    }

    this.setState({ initialized: true });
  }

  render() {
    const { initialized, demo } = this.state;

    if (!initialized) {
      return <Loading />;
    }
    return (
      <Provider store={store}>
        <ConnectedRouter history={history}>
          {(MyCommaAuth.isAuthenticated() || demo)
            ? <AuthRoutes />
            : <AnonymousRoutes />}
        </ConnectedRouter>
      </Provider>
    );
  }
}

export default App;
