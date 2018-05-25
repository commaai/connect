import { createMuiTheme } from '@material-ui/core/styles';
import Colors from './colors';

const theme = createMuiTheme({
  palette: {
    type: 'dark',
    background: {
      default: Colors.grey999
    },
    primary: {
      light: Colors.grey50,
      main: Colors.grey900,
      dark: Colors.grey999
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
      950: Colors.grey950,
      999: Colors.grey999
    }
  }
});

export default theme;
