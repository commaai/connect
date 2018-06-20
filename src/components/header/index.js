import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import AppBar from '@material-ui/core/AppBar';
import Grid from '@material-ui/core/Grid';
import Input from '@material-ui/core/Input';
import InputLabel from '@material-ui/core/InputLabel';
import FormControl from '@material-ui/core/FormControl';
import Toolbar from '@material-ui/core/Toolbar';
import Select from '@material-ui/core/Select';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import IconButton from '@material-ui/core/IconButton';

import { logOut } from '../../api/auth';
import { AccountIcon } from '../../icons';

import CurrentTime from './currentTime';
import Minimap from '../minimap';

const styles = theme => {
  console.log(theme);
  return {
    root: {
      position: 'relative',
      height: '140px'
    },
    appBar: {
      height: '140px'
    },
    toolBar: {
      [theme.breakpoints.up('md')]: {
        paddingLeft: theme.spacing.unit * 6,
        paddingRight: theme.spacing.unit * 6
      }
    },
    upperBar: {
      height: '90px',
      paddingTop: '20px',
      paddingBottom: '16px'
    },
    logo: {
      width: 'auto',
      height: '34px',
      margin: '16px 28px'
    },
    minimap: {
      position: 'absolute',
      bottom: 0,
      padding: '0 ' + theme.spacing.unit * 6 + 'px',
      width: '100%'
    }
  };
};

class AppHeader extends Component {
  constructor (props) {
    super(props);

    this.handleSearchChange = this.handleSearchChange.bind(this);
    this.handleSelectChange = this.handleSelectChange.bind(this);
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
  handleSelectChange (e) {
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
  selectedOption () {
    var timeRange = this.props.end - this.props.start;
    console.log(timeRange);

    return '2-weeks';
  }
  last2WeeksText () {
    if (!this.props.start || !this.props.end) {
      return '--';
    }
    return 'Past 2 Weeks'
       + fecha.format(new Date(this.props.start), ' (MMMM Do - ')
       + fecha.format(new Date(this.props.end), 'MMMM Do)');
  }
  render () {
    const { auth, anchorEl } = this.state;
    const open = Boolean(anchorEl);

    return (
      <div className={ this.props.classes.root }>
        <AppBar position='fixed' className={ this.props.classes.appBar }>
          <Toolbar className={ this.props.classes.toolBar } >
            <Grid container spacing={0} className={ this.props.classes.upperBar } >
              <Grid item xs={1} >
                <img src='/images/comma-white.png' className={ this.props.classes.logo } />
              </Grid>
              <Grid item xs={2} >
                {/*<FormControl style={{ width: '100%' }}>
                  <InputLabel htmlFor='search-bar'>Search</InputLabel>
                  <Input id='search-bar' value={ this.state.searchString || '' } onChange={ this.handleSearchChange } />
                </FormControl>*/}
              </Grid>
              <Grid item xs={6} >
                <CurrentTime />
              </Grid>
              <Grid item xs={2} align='right' >
                {/*<FormControl>
                  <Select
                    value={ this.selectedOption() }
                    onChange={ this.handleSelectChange }
                    name='timerange'>
                    <MenuItem value='2-weeks'>{ this.last2WeeksText() } </MenuItem>
                  </Select>
                </FormControl>*/}
              </Grid>
              <Grid item xs={1} >
                <div>
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
                    <MenuItem onClick={this.handleClose}>Profile</MenuItem>
                    <MenuItem onClick={this.handleClose}>My account</MenuItem>
                    <MenuItem onClick={this.handleLogOut}>Log out</MenuItem>
                  </Menu>
                </div>
              </Grid>
            </Grid>
          </Toolbar>
          <Minimap rounded dragSelection className={ this.props.classes.minimap } />
        </AppBar>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  start: 'workerState.start',
  end: 'workerState.end',
});

export default connect(stateToProps)(withStyles(styles)(AppHeader));
