import React, { Component } from 'react';
import { Provider } from 'react-redux';
import { Route, Redirect } from 'react-router';
import { ConnectedRouter } from 'react-router-redux';
import { timeout } from 'thyming';

import CircularProgress from '@material-ui/core/CircularProgress';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import HomePage from './components/homePage';
import Explorer from './components/explorer';

import TimelineWorker from './timeline';
import { history, createStore } from './store';
import { updateState } from './actions';
import * as Auth from './api/auth';

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

    Auth.init()
    .then((isAuthed) => isAuthed && TimelineWorker.init())
    .then(() => {
      this.setState({ initialized: true });
    });
  }
  authRoutes () {
    return (
      <div>
        <Route path="/" component={ Explorer } />
        <Route path="/auth/g/redirect" render={ () => <Redirect to="/" /> } />
      </div>
    );
  }
  ananymousRoutes () {
    return (
      <Grid container alignItems='center' style={{ width: '100%', height: '100%', marginTop: '30vh' }}>
        <Grid item align='center' xs={12} >
          <a href={ Auth.oauthRedirectLink }>
            <Typography variant='title'>Sign in</Typography>
          </a>
        </Grid>
      </Grid>
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
