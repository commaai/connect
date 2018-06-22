import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import Divider from '@material-ui/core/Divider';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';
import Modal from '@material-ui/core/Modal';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import Paper from '@material-ui/core/Paper';

import { DateTimePicker } from 'material-ui-pickers';

import Timelineworker from '../../timeline';

const styles = theme => {
  return {
    root: {},
    modal: {
      position: 'absolute',
      padding: theme.spacing.unit * 2,
      width: theme.spacing.unit * 50,
      margin: '0 auto',
      left: '50%',
      top: '40%',
      transform: 'translate(-50%, -50%)'
    },
    buttonGroup: {
      textAlign: 'right'
    }
  };
};

class TimeframePicker extends Component {
  constructor (props) {
    super(props);

    this.handleSelectChange = this.handleSelectChange.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.changeStart = this.changeStart.bind(this);
    this.changeEnd = this.changeEnd.bind(this);
    this.handleSave = this.handleSave.bind(this);

    this.state = {
      showPicker: true
    };
  }

  handleSelectChange (e) {
    var selection = e.target.value;
    var d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);

    switch (selection) {
      case '24-hours':
        Timelineworker.selectTimeRange(d.getTime() - (1000 * 60 * 60 * 24), d.getTime());
        break;
      case '1-week':
        Timelineworker.selectTimeRange(d.getTime() - (1000 * 60 * 60 * 24 * 7), d.getTime());
        break;
      case '2-weeks':
        Timelineworker.selectTimeRange(d.getTime() - (1000 * 60 * 60 * 24 * 14), d.getTime());
        break;
      case 'custom':
        this.setState({
          showPicker: true,
          start: this.props.start,
          end: this.props.end
        });
        break;
    }
  }

  handleClose () {
    this.setState({
      showPicker: false
    });
  }
  changeStart (value) {
    this.setState({
      start: value.getTime()
    });
  }
  changeEnd (value) {
    this.setState({
      end: value.getTime()
    });
  }
  handleSave () {
    Timelineworker.selectTimeRange(this.state.start, this.state.end);
    this.setState({
      showPicker: false,
      start: null,
      end: null
    });
  }

  selectedOption () {
    var timeRange = this.props.end - this.props.start;
    console.log(timeRange);

    if (Math.abs(this.props.end - Date.now()) < 1000 * 60 * 60) {
      // ends right around now
      if (timeRange === 1000 * 60 * 60 * 24 * 14) {
        return '2-weeks';
      } else if (timeRange === 1000 * 60 * 60 * 24 * 7) {
        return '1-week';
      } else if (timeRange === 1000 * 60 * 60 * 24) {
        return '24-hours';
      }
    }

    return 'custom';
  }

  lastWeekText () {
    if (!this.props.start || !this.props.end) {
      return '--';
    }
    return 'Last Week'
       + fecha.format(new Date(this.props.start), ' (MMM Do - ')
       + fecha.format(new Date(this.props.end), 'MMM Do)');
  }
  last2WeeksText () {
    if (!this.props.start || !this.props.end) {
      return '--';
    }
    return 'Past 2 Weeks'
       + fecha.format(new Date(this.props.start), ' (MMM Do - ')
       + fecha.format(new Date(this.props.end), 'MMM Do)');
  }
  last24HoursText () {
    if (!this.props.start || !this.props.end) {
      return '--';
    }
    return 'Last 24h';
  }

  render () {
    return (
      <React.Fragment>
        <FormControl>
          <Select
            value={ this.selectedOption() }
            onChange={ this.handleSelectChange }
            name='timerange'>
            <MenuItem value='custom'>Custom</MenuItem>
            <MenuItem value='24-hours'>{ this.last24HoursText() } </MenuItem>
            <MenuItem value='1-week'>{ this.lastWeekText() } </MenuItem>
            <MenuItem value='2-weeks'>{ this.last2WeeksText() } </MenuItem>
          </Select>
        </FormControl>

          <Modal
            aria-labelledby="simple-modal-title"
            aria-describedby="simple-modal-description"
            open={ this.state.showPicker }
            onClose={ this.handleClose }
          >
            <Paper className={ this.props.classes.modal } >
              <DateTimePicker
                value={ new Date(this.state.start || this.props.start || 0) }
                onChange={ this.changeStart }
                label="Start time"
                showTodayButton
              />

              <DateTimePicker
                value={ new Date(this.state.end || this.props.end || 0) }
                onChange={ this.changeEnd }
                label="End time"
                showTodayButton
              />
              <br />
              <br />
              <Divider />
              <br />
              <div className={ this.props.classes.buttonGroup } >
                <Button variant='contained' onClick={ this.handleClose } >
                  Cancel
                </Button>
                &nbsp;
                <Button variant='contained' color='secondary' onClick={ this.handleSave }>
                  Save
                </Button>
              </div>
            </Paper>
          </Modal>
      </React.Fragment>
    );
  }
}

const stateToProps = Obstruction({
  end: 'workerState.end',
  start: 'workerState.start'
});

export default connect(stateToProps)(withStyles(styles)(TimeframePicker));
