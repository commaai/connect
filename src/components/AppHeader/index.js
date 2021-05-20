import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import Obstruction from 'obstruction';
import localforage from 'localforage';

import { withStyles } from '@material-ui/core/styles';
import { Divider, Typography, Menu, MenuItem, ListItem, IconButton, Icon, AppBar } from '@material-ui/core';

import MyCommaAuth from '@commaai/my-comma-auth';

import TimeFilter from './TimeFilter';
import TimeDisplay from '../TimeDisplay';
import { AccountIcon } from '../../icons';
import Colors from '../../colors';
import ResizeHandler from '../ResizeHandler';

const styles = (theme) => ({
  header: {
    backgroundColor: '#1D2225',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 7.5,
    flexWrap: 'wrap',
  },
  titleContainer: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  hamburger: {
    marginRight: 10,
  },
  logo: {
    alignItems: 'center',
    display: 'flex',
    maxWidth: 200,
    textDecoration: 'none',
  },
  logoImgLink: {
    lineHeight: 0,
  },
  logoImg: {
    height: '34px',
    margin: '0px 28px',
    width: 'auto',
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
  },
  accountIcon: {
    color: Colors.white30,
    height: 34,
    width: 34,
  },
  accountListEmail: {
    fontWeight: 'bold',
  },
  accountListItem: {
    color: Colors.white,
  },
  accountMenuItem: {
    padding: '12px 24px',
  },
});

class AppHeader extends Component {
  constructor(props) {
    super(props);

    this.handleClickedAccount = this.handleClickedAccount.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleLogOut = this.handleLogOut.bind(this);
    this.toggleDrawer = this.toggleDrawer.bind(this);
    this.onResize = this.onResize.bind(this);

    this.state = {
      anchorEl: null,
      windowWidth: window.innerWidth,
    };
  }

  toggleDrawer() {
    this.props.handleDrawerStateChanged(!this.props.drawerIsOpen);
  }

  handleClickedAccount(event) {
    this.setState({ anchorEl: event.currentTarget });
  }

  handleClose() {
    this.setState({ anchorEl: null });
  }

  handleLogOut() {
    this.handleClose();
    localforage.removeItem('isDemo');
    MyCommaAuth.logOut();
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { profile, classes, annotating, showDrawerButton, showMenuButton } = this.props;
    const { anchorEl } = this.state;
    const open = Boolean(anchorEl);

    let reorderWideStyle = {};
    if (this.state.windowWidth < 660) {
      reorderWideStyle = {
        order: 4,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
      };
    }

    if (!profile) {
      return [];
    }

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <AppBar position="sticky" elevation="1">
          <div ref={ this.props.forwardRef } className={ classes.header }>
            <div className={classes.titleContainer}>
              { showDrawerButton ?
                <IconButton aria-label="menu" className={classes.hamburger} onClick={this.toggleDrawer}>
                  <Icon>menu</Icon>
                </IconButton>
              :
                <Link to="/" className={ classes.logoImgLink }>
                  <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
                </Link>
              }
              <Link to="/" className={classes.logo}>
                <Typography className={classes.logoText}>
                  explorer
                </Typography>
              </Link>
            </div>
            <div className={ classes.headerWideItem } style={ reorderWideStyle }>
              { annotating ?
                <TimeDisplay isThin /> :
                <TimeFilter /> }
            </div>
            <IconButton aria-owns={open ? 'menu-appbar' : null} aria-haspopup="true" onClick={this.handleClickedAccount}>
              <AccountIcon className={classes.accountIcon} />
            </IconButton>
          </div>
        </AppBar>
        <Menu id="menu-appbar" open={open} onClose={this.handleClose} anchorEl={anchorEl}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          <ListItem className={ classes.accountListItem + ' ' + classes.accountListEmail }>{ profile.email }</ListItem>
          <ListItem className={ classes.accountListItem }>{ profile.points } points</ListItem>
          <Divider />
          <MenuItem className={ classes.accountMenuItem } component="a" href="/useradmin/" target="_blank">
            Manage Account
          </MenuItem>
          <MenuItem className={ classes.accountMenuItem } onClick={this.handleLogOut}>Log out</MenuItem>
        </Menu>
      </>
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
