import { createMuiTheme } from '@material-ui/core/styles';
import Colors from './colors';

const theme = createMuiTheme({
  // Font ownership lives in index.css. MUI controls inherit the HTML default.
  typography: {
    fontFamily: 'inherit',
  },
  overrides: {
    MuiButton: {
      root: {
        textTransform: 'none',
      },
    },
    MuiPaper: {
      root: {
        backgroundColor: '#30373B',
      },
    },
  },
  palette: {
    type: 'dark',
    primary: {
      light: Colors.lightBlue700,
      main: Colors.lightBlue900,
      dark: Colors.blue100,
    },
    secondary: {
      light: Colors.green100,
      main: Colors.green200,
      dark: Colors.green500,
    },
    grey: {
      50: Colors.grey50,
      100: Colors.grey100,
      200: Colors.grey200,
      300: Colors.grey300,
      400: Colors.grey400,
      500: Colors.grey500,
      600: Colors.grey600,
      700: Colors.grey700,
      800: Colors.grey800,
      900: Colors.grey900,
    },
  },
});

export default theme;
