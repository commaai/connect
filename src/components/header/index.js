import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';

import Typography from '@material-ui/core/Typography';
import AppBar from '@material-ui/core/AppBar';
import Grid from '@material-ui/core/Grid';
import { withStyles } from '@material-ui/core/styles';
import Input from '@material-ui/core/Input';
import InputLabel from '@material-ui/core/InputLabel';
import FormControl from '@material-ui/core/FormControl';
import Toolbar from '@material-ui/core/Toolbar';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';

import CurrentTime from './currentTime';

const styles = theme => ({
  appBar: {
  }
});

class AppHeader extends Component {
  constructor (props) {
    super(props);
    this.handleSearchChange = this.handleSearchChange.bind(this);
    this.handleSelectChange = this.handleSelectChange.bind(this);

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
    const imgStyles = {
      width: 'auto',
      height: '40px',
      margin: '0 20px'
    };
    return (
      <div className={ this.props.classes.root }>
        <AppBar position='sticky' className={ this.props.classes.appBar }>
          <Toolbar>
            <Grid container spacing={24}>
              <Grid item xs={1}>
                <img src='/images/comma-white.png' style={ imgStyles } />
              </Grid>
              <Grid item xs={3}>
                <FormControl style={{ width: '100%' }}>
                  <InputLabel htmlFor='search-bar'>Search</InputLabel>
                  <Input id='search-bar' value={ this.state.searchString || '' } onChange={ this.handleSearchChange } />
                </FormControl>
              </Grid>
              <Grid item xs={4}>
                <CurrentTime />
              </Grid>
              <Grid item xs={3} align='right'>
                <FormControl>
                  <Select
                    value={ this.selectedOption() }
                    onChange={ this.handleSelectChange }
                    name='timerange'>
                    <MenuItem value='2-weeks'>{ this.last2WeeksText() } </MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={1}>
                <img src='/images/comma-white.png' style={ imgStyles } />
              </Grid>
            </Grid>
          </Toolbar>
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
