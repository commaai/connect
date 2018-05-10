import React, { Component } from 'react';
import { Provider } from 'react-redux';
import { Route } from 'react-router';
import { ConnectedRouter } from 'react-router-redux';

import { history, createStore } from './store';
import logo from './logo.svg';
import './App.css';

const store = createStore();

class HomePage extends Component {
  render() {
    return (
      <div className="App">
        Explorer and stuff
      </div>
    );
  }
}

class App extends Component {
  render() {
    return (
      <Provider store={store}>
        <ConnectedRouter history={history}>
          <div>
            <Route path="/" component={HomePage} />
          </div>
        </ConnectedRouter>
      </Provider>
    );
  }
}

export default App;
