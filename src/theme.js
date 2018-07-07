import { createMuiTheme } from '@material-ui/core/styles';
import Colors from './colors';
import { ChevronIcon, AccountIcon } from './icons';

const theme = createMuiTheme({
  overrides: {
    MuiSelect: {
      select: {
        padding: '12px 16px',
        margin: '0 16px 0 0',
        '&>div': {
          margin: '0',
        }
      },
      icon: {
        marginRight: 20,
        color: 'rgba(255, 255, 255, 0.25)'
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
          opacity: 1,
          color: Colors.white30
        }
      }
    },
    MuiFormLabel: {
      root: {
        marginLeft: 16,
        marginTop: 4
      }
    }
  },
  // shape: {
  //   borderRadius: 8
  // },
  props: {
    MuiSelect: {
      disableUnderline: true,
      IconComponent: ChevronIcon
    },
    MuiInput: {
      disableUnderline: true
    }
  },
  palette: {
    type: 'dark',
    placeholder: Colors.white30,
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
    white: {
      10: Colors.white10,
      12: Colors.white12,
      20: Colors.white20,
      30: Colors.white30,
      40: Colors.white40,
      50: Colors.white50,
    },
    error: {
      main: 'rgba(209,106,35,0.72)'
    }
  }
});

export default theme;
