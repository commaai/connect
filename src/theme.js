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
    MuiDrawer: {
      paper: {
        overflowY: null,
      },
      paperAnchorDockedLeft: {
        borderRight: 'none',
      },
    },
    MuiInput: {
      root: {
        position: 'relative',
        border: `1px solid ${Colors.grey800}`,
        borderRadius: 20,
        overflow: 'hidden',
      },
      input: {
        padding: '12px 16px',
        '&::placeholder': {
          opacity: 1,
          color: Colors.white30,
        },
        '&:focus': {
          outline: 'none',
          boxShadow: 'none',
        },
      },
    },
    MuiInputLabel: {
      shrink: {
        transform: 'translate(0, -2px) scale(0.75)',
      },
    },
    MuiFormLabel: {
      root: {
        marginLeft: 16,
        marginTop: 4,
      },
    },
    MuiFormHelperText: {
      root: {
        marginLeft: 8,
        marginTop: 4,
      },
    },
    MuiListItem: {
      root: {
        '&:focus': {
          outline: 'none',
          boxShadow: 'none',
        },
      },
    },
  },
  props: {
    MuiInput: {
      disableUnderline: true,
    },
  },
  palette: {
    type: 'dark',
    background: {
      default: Colors.grey999,
    },
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
    error: {
      main: 'rgba(209, 35, 35, 0.72)',
    },
  },
});

export default theme;
