import React, { Component } from 'react';
import { Provider } from 'react-redux';
import { Route } from 'react-router';
import { ConnectedRouter } from 'react-router-redux';

import HomePage from './components/homePage';
import SelectDevice from './components/selectDevice';

import { history, createStore } from './store';
import './App.css';

const store = createStore();

class App extends Component {
  render() {
    return (
      <Provider store={ store }>
        <ConnectedRouter history={ history }>
          <div>
            <Route path="/" component={ SelectDevice } />
          </div>
        </ConnectedRouter>
      </Provider>
    );
  }
}

export default App;
