import React, { Component } from 'react';
import { Provider } from 'react-redux';
import { Route, Switch, Redirect } from 'react-router';
import { ConnectedRouter } from 'connected-react-router';
import { timeout } from 'thyming';
import document from 'global/document';
import qs from 'query-string';
import localforage from 'localforage';
import Jepsen from 'carly';
import Collector from 'collect-methods';

import CircularProgress from '@material-ui/core/CircularProgress';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

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

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      initialized: false,
      demo: false,
    };

    this.cancelInit = Collector();

    const initDemoTimeline = Jepsen(() => {
      TimelineWorker.init(true).then(initDemoState.callback);
    });

    const checkDemo = Jepsen((isDemo) => {
      if (isDemo) {
        return localforage.setItem('isDemo', '1')
          .then(initDemoTimeline.callback);
      }
      return this.auth();
    });

    const initDemoState = Jepsen(() => {
      TimelineWorker.selectTimeRange(1564443025000, Date.now());
      this.setState({
        initialized: true,
        demo: true,
      });
    });

    this.cancelInit(checkDemo.cancel);
    this.cancelInit(initDemoTimeline.cancel);
    this.cancelInit(initDemoState.cancel);

    Demo.init().then(checkDemo.callback);
  }

  componentWillUnmount() {
    this.cancelInit();
    TimelineWorker.stop();
  }

  async auth() {
    if (document.location) {
      if (document.location.pathname == AuthConfig.GOOGLE_REDIRECT_PATH ||
          document.location.pathname == AuthConfig.APPLE_REDIRECT_PATH ||
          document.location.pathname == AuthConfig.GITHUB_REDIRECT_PATH)
        {
        const { code } = qs.parse(document.location.search);
        try {
          let token = null;
          if (document.location.pathname == AuthConfig.GOOGLE_REDIRECT_PATH) {
            token = await AuthApi.refreshAccessToken(code, AuthConfig.GOOGLE_REDIRECT_URI, 'google');
          } else if (document.location.pathname == AuthConfig.APPLE_REDIRECT_PATH) {
            token = await AuthApi.refreshAccessToken(code, AuthConfig.APPLE_REDIRECT_URI, 'apple');
          } else if (document.location.pathname == AuthConfig.GITHUB_REDIRECT_PATH) {
            token = await AuthApi.refreshAccessToken(code, AuthConfig.GItHUB_REDIRECT_URI, 'github');
          }
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
      <Grid container alignItems="center" style={{ width: '100%', height: '100%' }}>
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
