import { createMuiTheme } from '@material-ui/core/styles';
import Colors from './colors';

const theme = createMuiTheme({
  palette: {
    type: 'dark',
    primary: {
      light: Colors.grey50,
      main: Colors.grey500,
      dark: Colors.grey700
    }
  },
  spacing: {
    gutter: '20px'
  }
});

export default theme;
