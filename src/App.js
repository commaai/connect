import React, { Component } from 'react';
import { Provider } from 'react-redux';
import { Route, Switch, Redirect } from 'react-router';
import { ConnectedRouter } from 'connected-react-router';
import { timeout } from 'thyming';
import document from 'global/document';
import qs from 'query-string';

import CircularProgress from '@material-ui/core/CircularProgress';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import MyCommaAuth from '@commaai/my-comma-auth';
import { exchangeCodeForTokens } from '@commaai/my-comma-auth/google';
import { auth as AuthApi, request as Request } from '@commaai/comma-api';

import Explorer from './components/explorer';
import AnonymousLanding from './components/anonymous';

import TimelineWorker from './timeline';
import { history, createStore } from './store';
import { updateState } from './actions';
import { initGoogleAnalytics } from './analytics';

initGoogleAnalytics(history);
const store = createStore();

TimelineWorker.onStateChange(function (data) {
  store.dispatch(updateState(data));
});

class App extends Component {
  constructor (props) {
    super(props);

    this.state = {
      initialized: false
    };

    this.auth();
  }
  async auth () {
    if (document.location) {
      if (document.location.pathname == '/auth/g/redirect') {
        var code = qs.parse(document.location.search)['code'];

        try {
          const tokens = await exchangeCodeForTokens(code);
          await AuthApi.commaTokenExchange(tokens.access_token, tokens.id_token);
          // done authing!!
        } catch (e) {
        }
      }
    }

    const token = await MyCommaAuth.init();
    Request.configure(token);

    if (MyCommaAuth.isAuthenticated()) {
      await TimelineWorker.init(token);
    }

    this.setState({ initialized: true });
  }
  redirectLink () {
    let url = '/';
    if (typeof window.sessionStorage !== 'undefined') {
      url = sessionStorage.redirectURL || '/';
    }
    return url;
  }
  authRoutes () {
    return (
      <Switch>
        <Route path="/auth/" render={ () => <Redirect to={ this.redirectLink() } /> } />
        <Route path="/" component={ Explorer } />
      </Switch>
    );
  }
  ananymousRoutes () {
    return (
      <Switch>
        <Route path="/auth/" render={ () => <Redirect to="/" /> } />
        <Route path="/" component={ AnonymousLanding } />
      </Switch>
    );
  }
  renderLoading () {
    return (
      <Grid container alignItems='center' style={{ width: '100%', height: '100%' }}>
        <Grid item align='center' xs={12} >
          <CircularProgress size='10vh' style={{ color: '#525E66' }} />
        </Grid>
      </Grid>
    );
  }
  render() {
    if (!this.state.initialized) {
      return this.renderLoading();
    }
    return (
      <Provider store={ store }>
        <ConnectedRouter history={ history }>
          { MyCommaAuth.isAuthenticated() ? this.authRoutes() : this.ananymousRoutes() }
        </ConnectedRouter>
      </Provider>
    );
  }
}

export default App;
