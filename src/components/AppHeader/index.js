import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import { Divider, Typography, Menu, MenuItem, ListItem, IconButton, Icon, AppBar } from '@material-ui/core';

import MyCommaAuth from '@commaai/my-comma-auth';

import { selectDevice } from '../../actions';
import TimeFilter from './TimeFilter';
import { AccountIcon } from '../../icons';
import Colors from '../../colors';
import ResizeHandler from '../ResizeHandler';
import { filterRegularClick } from '../../utils';

const styles = () => ({
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
    height: 34,
    width: 18.9,
    margin: '0px 28px',
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
  accountListItem: {
    color: Colors.white,
    padding: '12px 16px',
  },
  accountListEmail: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingBottom: 4,
    '& :first-child': {
      fontWeight: 'bold',
      marginBottom: 2,
    },
    '& :last-child': {
      fontSize: '0.75em',
      color: Colors.white40,
    },
  },
  accountMenuItem: {
    padding: '12px 16px',
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
    if (MyCommaAuth.isAuthenticated()) {
      this.setState({ anchorEl: event.currentTarget });
    } else if (window.location) {
      window.location = window.location.origin;
    }
  }

  handleClose() {
    this.setState({ anchorEl: null });
  }

  async handleLogOut() {
    this.handleClose();
    await MyCommaAuth.logOut();

    if (window.location) {
      window.location = window.location.origin;
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { profile, classes, annotating, showDrawerButton, primeNav, clips, dongleId } = this.props;
    const { anchorEl } = this.state;
    const open = Boolean(anchorEl);

    let reorderWideStyle = {};
    if (this.state.windowWidth < 640) {
      reorderWideStyle = {
        order: 4,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
      };
    }

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <AppBar position="sticky" elevation={ 1 }>
          <div ref={ this.props.forwardRef } className={ classes.header }>
            <div className={classes.titleContainer}>
              { showDrawerButton ? (
                <IconButton aria-label="menu" className={classes.hamburger} onClick={this.toggleDrawer}>
                  <Icon>menu</Icon>
                </IconButton>
              )
                : (
                  <a
                    href={ `/${dongleId}` }
                    className={ classes.logoImgLink }
                    onClick={ filterRegularClick(() => this.props.dispatch(selectDevice(dongleId))) }
                  >
                    <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
                  </a>
                )}
              <a
                href={ `/${dongleId}` }
                className={classes.logo}
                onClick={ filterRegularClick(() => this.props.dispatch(selectDevice(dongleId))) }
              >
                <Typography className={classes.logoText}>connect</Typography>
              </a>
            </div>
            <div className={ classes.headerWideItem } style={ reorderWideStyle }>
              { Boolean(!primeNav && !clips && !annotating && dongleId) && <TimeFilter /> }
            </div>
            <IconButton
              aria-owns={open ? 'menu-appbar' : null}
              aria-haspopup="true"
              onClick={this.handleClickedAccount}
              aria-label="account menu"
            >
              <AccountIcon className={classes.accountIcon} />
            </IconButton>
          </div>
        </AppBar>
        { Boolean(MyCommaAuth.isAuthenticated() && profile) && (
        <>
          <Menu
            id="menu-appbar"
            open={open}
            onClose={this.handleClose}
            anchorEl={anchorEl}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <ListItem className={ `${classes.accountListItem} ${classes.accountListEmail}` }>
              <span>{ profile.email }</span>
              <span>{ profile.user_id }</span>
            </ListItem>
            <ListItem className={ classes.accountListItem }>
              { profile.points }
              {' '}
              points
            </ListItem>
            <Divider />
            <MenuItem
              className={ classes.accountMenuItem }
              component="a"
              href="https://useradmin.comma.ai/"
              target="_blank"
            >
              Manage Account
            </MenuItem>
            <MenuItem
              className={ classes.accountMenuItem }
              onClick={this.handleLogOut}
            >
              Log out
            </MenuItem>
          </Menu>
        </>
        ) }
      </>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  filter: 'filter',
  profile: 'profile',
  primeNav: 'primeNav',
  clips: 'clips',
});

export default connect(stateToProps)(withStyles(styles)(AppHeader));
