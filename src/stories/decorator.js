const { Provider } = require('react-redux');
const CssBaseline = require('@material-ui/core/CssBaseline');
const { MuiThemeProvider } = require('@material-ui/core/styles');

const createStore = require('../store');
const Theme = require('../theme');

const store = createStore();

module.exports = decorate;

function decorate(story) {
  return (
    <MuiThemeProvider theme={Theme}>
      <CssBaseline />
      <Provider store={store}>
        { story() }
      </Provider>
    </MuiThemeProvider>
  );
}
