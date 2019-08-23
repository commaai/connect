import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import Obstruction from 'obstruction';
import fecha from 'fecha';
import localforage from 'localforage';

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

import MyCommaAuth from '@commaai/my-comma-auth';

import TimeFilter from './TimeFilter';
import TimeDisplay from '../TimeDisplay';
import { AccountIcon } from '../../icons';

import Timelineworker from '../../timeline';

const styles = theme => {
  return {
    base: {
      backgroundColor: '#1D2225',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex',
      width: '100%',
    },
    logo: {
      alignItems: 'center',
      display: 'flex',
      maxWidth: 200,
      textDecoration: 'none',
    },
    logoImg: {
      height: '34px',
      margin: '0px 28px',
      width: 'auto',
    },
    logoText: {
      fontFamily: 'MaisonNeueExtended',
      fontSize: 18,
      fontWeight: 600,
    },
    timeDisplay: {
      alignItems: 'center',
    },
    selectArea: {
      alignItems: 'center',
      display: 'flex',
      justifyContent: 'flex-end',
      marginLeft: 'auto',
      paddingRight: 28,
    },
    accountIcon: {
      color: '#272D30',
      height: 34,
      width: 34,
    },
    userMeta: {
      outline: 'none',
      padding: `${ theme.spacing.unit }px ${ theme.spacing.unit * 2 }px`,
      borderBottom: '1px solid ' + theme.palette.white[12],
    },
  };
};

class AppHeader extends Component {
  constructor (props) {
    super(props);

    this.handleClickedAccount = this.handleClickedAccount.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleLogOut = this.handleLogOut.bind(this);

    this.state = {
      anchorEl: null,
    };
  }

  handleClickedAccount (event) {
    this.setState({ anchorEl: event.currentTarget });
  }

  handleClose () {
    this.setState({ anchorEl: null });
  }

  handleLogOut() {
    this.handleClose();
    localforage.removeItem('isDemo');
    MyCommaAuth.logOut();
  }

  render () {
    const { profile, classes } = this.props;
    const { auth, anchorEl } = this.state;
    const open = Boolean(anchorEl);

    return (
      <header className={ classes.base }>
        <Grid container spacing={ 0 }>
          <Grid item container xs={ 2 } lg={ 4 }>
            <Link to="/" className={ classes.logo }>
              <img src='/images/comma-white.png' className={ classes.logoImg } />
              <Typography className={ classes.logoText }>
                explorer
              </Typography>
            </Link>
          </Grid>
          <Grid item container xs={ 6 } lg={ 4 } className={ classes.timeDisplay }>
            <TimeDisplay isThin />
          </Grid>
          <Grid
            item
            xs={ 4 }
            align='right'
            className={ classes.selectArea }>
            <TimeFilter />
            <IconButton
              aria-owns={open ? 'menu-appbar' : null}
              aria-haspopup='true'
              onClick={ this.handleClickedAccount }>
              <AccountIcon className={ classes.accountIcon } />
            </IconButton>
            <Menu
              id='menu-appbar'
              open={ open }
              onClose={ this.handleClose }
              anchorEl={ anchorEl }
              anchorOrigin={ {
                vertical: 'top',
                horizontal: 'right',
              } }
              transformOrigin={ {
                vertical: 'top',
                horizontal: 'right',
              } }>
              <ListItem classes={ { root: classes.userMeta } } disableGutters>
                <div>
                  <Typography variant='body2' paragraph>
                    { profile.email }
                  </Typography>
                  <Typography variant='body1' paragraph>
                    { profile.points } points
                  </Typography>
                </div>
              </ListItem>
              <MenuItem onClick={ this.handleLogOut }>Log out</MenuItem>
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
