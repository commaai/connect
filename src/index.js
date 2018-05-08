import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import registerServiceWorker from './registerServiceWorker';

const TimelineWorker = require('./timeline');
console.log(TimelineWorker.getValue());

ReactDOM.render(<App />, document.getElementById('root'));
registerServiceWorker();
