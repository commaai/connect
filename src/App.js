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

import HomePage from './components/homePage';
import Explorer from './components/explorer';
import AnonymousLanding from './components/anonymous';

import TimelineWorker from './timeline';
import { history, createStore } from './store';
import { updateState } from './actions';
import * as Auth from './api/auth';
import { exchangeCodeForTokens, commaTokenExchange } from './api/auth/google';

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
          await commaTokenExchange(tokens.access_token, tokens.id_token);
          // done authing!!
        } catch (e) {
        }
      }
    }

    await Auth.init();

    if (Auth.isAuthenticated()) {
      await TimelineWorker.init();
    }

    this.setState({ initialized: true });
  }
  authRoutes () {
    return (
      <Switch>
        <Route path="/auth/" render={ () => <Redirect to="/" /> } />
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
      <Grid container alignItems='center' style={{ width: '100%', height: '100%', marginTop: '30vh' }}>
        <Grid item align='center' xs={12} >
          <Typography>
            Downloading the entire internet...
          </Typography>
          <CircularProgress size='10vh' color='secondary' />
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
          { Auth.isAuthenticated() ? this.authRoutes() : this.ananymousRoutes() }
        </ConnectedRouter>
      </Provider>
    );
  }
}

export default App;
