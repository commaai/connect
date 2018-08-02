import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import Obstruction from 'obstruction';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';
import Input from '@material-ui/core/Input';
import InputLabel from '@material-ui/core/InputLabel';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import ListItem from '@material-ui/core/ListItem';
import IconButton from '@material-ui/core/IconButton';

import CurrentTime from './currentTime';
import TimeframePicker from './timepicker';
import Minimap from '../minimap';
import { AccountIcon } from '../../icons';

import { logOut } from '../../api/auth';
import Timelineworker from '../../timeline';

const styles = theme => {
  console.log(theme);
  return {
    base: {
      backgroundColor: '#1D2225',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      paddingTop: '16px',
      paddingBottom: '16px',
      width: '100%',
    },
    logo: {
      alignItems: 'center',
      display: 'flex',
      textDecoration: 'none',
    },
    logoImg: {
      width: 'auto',
      height: '34px',
      margin: '16px 28px',
    },
    logoText: {
      fontFamily: 'MaisonNeueExtended',
      fontSize: 22,
      fontWeight: 600,
    },
    minimap: {
      position: 'absolute',
      bottom: 0,
      padding: '0 ' + theme.spacing.unit * 6 + 'px',
      width: '100%',
      cursor: 'ew-resize'
    },
    userMeta: {
      outline: 'none',
      padding: `${theme.spacing.unit}px ${theme.spacing.unit * 2}px`,
      borderBottom: '1px solid ' + theme.palette.white[12],
    }
  };
};

class AppHeader extends Component {
  constructor (props) {
    super(props);

    this.handleSearchChange = this.handleSearchChange.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleMenu = this.handleMenu.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleLogOut = this.handleLogOut.bind(this);

    this.state = {
      searchString: props.search || ''
    };
  }
  componentDidUpdate (prevProps, prevState) {
    if (prevProps.dongleId !== this.props.dongleId) {
      // console.log('Setting state from props', this.props.dongleId);
      // this.setState({
      //   searchString: this.props.dongleId
      // });
    }
  }

  handleChange (event, checked) {
    this.setState({ auth: checked });
  }

  handleMenu (event) {
    this.setState({ anchorEl: event.currentTarget });
  }

  handleClose () {
    this.setState({ anchorEl: null });
  }

  handleLogOut() {
    this.handleClose();
    logOut();
  }

  handleSearchChange (e) {
    console.log('Setting state', e.target.value)
    this.setState({
      searchString: e.target.value
    });
  }

  render () {
    const { auth, anchorEl } = this.state;
    const open = Boolean(anchorEl);

    return (
      <header className={ this.props.classes.base }>
        <Grid container spacing={ 0 }>
          <Grid item xs={4}>
            <Link to="/" className={ this.props.classes.logo }>
              <img src='/images/comma-white.png' className={ this.props.classes.logoImg } />
              <Typography className={ this.props.classes.logoText }>
                explorer
              </Typography>
            </Link>
          </Grid>
          <Grid item xs={6} lg={4} align='center' >
            <CurrentTime />
          </Grid>
          <Grid item xs={5} lg={4} align='right' >
            <TimeframePicker />
            <IconButton
              aria-owns={open ? 'menu-appbar' : null}
              aria-haspopup="true"
              onClick={this.handleMenu}
              color="inherit" >
              <AccountIcon />
            </IconButton>
            <Menu
              id="menu-appbar"
              anchorEl={anchorEl}
              anchorOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              open={open}
              onClose={this.handleClose}>
              <ListItem classes={ { root: this.props.classes.userMeta } } disableGutters>
                <div>
                  <Typography variant='body2' paragraph>{ this.props.profile.email }</Typography>
                  <Typography variant='body1' paragraph>{ this.props.profile.points } points</Typography>
                </div>
              </ListItem>
              <MenuItem onClick={this.handleLogOut}>Log out</MenuItem>
            </Menu>
          </Grid>
        </Grid>
      </header>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  start: 'workerState.start',
  end: 'workerState.end',
  profile: 'workerState.profile',
});

export default connect(stateToProps)(withStyles(styles)(AppHeader));
