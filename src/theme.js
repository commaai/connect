import { createMuiTheme } from '@material-ui/core/styles';
import Colors from './colors';

const theme = createMuiTheme({
  overrides: {
    MuiSelect: {
      select: {
        // padding: '12px 16px'
        // height: '100%'
      },
      icon: {

      }
    },
    MuiInput: {
      root: {
        position: 'relative',
        border: '1px solid ' + Colors.grey800,
        borderRadius: 20,
        overflow: 'hidden'
      },
      input: {
        margin: '12px 16px',
        padding: 0,
        '&::placeholder': {
          color: 'rgba(255, 255, 255, 0.2)'
        }
      }
    }
  },
  props: {
    MuiSelect: {
      disableUnderline: true
    },
    MuiInput: {
      disableUnderline: true
    }
  },
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
    },
    error: {
      main: 'rgba(209,106,35,0.72)'
    }
  }
});

export default theme;
