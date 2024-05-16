import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import dayjs from 'dayjs';

import { Button, Divider, FormControl, MenuItem, Modal, Paper, Select, Typography, withStyles } from '@material-ui/core';

import Colors from '../../colors';
import { selectTimeFilter } from '../../actions';
import { getDefaultFilter } from '../../initialState';
import VisibilityHandler from '../VisibilityHandler';

const styles = (theme) => ({
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
    maxWidth: '90%',
    margin: '0 auto',
    left: '50%',
    top: '40%',
    transform: 'translate(-50%, -50%)',
    outline: 'none',
  },
  buttonGroup: {
    marginTop: 20,
    textAlign: 'right',
  },
  headerDropdown: {
    fontWeight: 500,
    marginRight: 12,
    width: 310,
    maxWidth: '90%',
    textAlign: 'center',
  },
  datePickerContainer: {
    display: 'flex',
    marginBottom: 20,
    '& aside': { width: 100 },
  },
  cancelButton: {
    backgroundColor: Colors.grey200,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey400,
    },
  },
  saveButton: {
    backgroundColor: Colors.white,
    color: Colors.grey800,
    '&:hover': {
      backgroundColor: Colors.white70,
    },
  },
});

const LOOKBACK_WINDOW_MILLIS = 365 * 24 * 3600 * 1000; // 30 days

class TimeSelect extends Component {
  constructor(props) {
    super(props);

    this.state = {
      showPicker: false,
    };

    this.handleSelectChange = this.handleSelectChange.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.changeStart = this.changeStart.bind(this);
    this.changeEnd = this.changeEnd.bind(this);
    this.handleSave = this.handleSave.bind(this);
    this.onVisible = this.onVisible.bind(this);
  }

  handleSelectChange(e) {
    const selection = e.target.value;
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);

    switch (selection) {
      case '24-hours':
        this.props.dispatch(selectTimeFilter(d.getTime() - (1000 * 60 * 60 * 24), d.getTime()));
        break;
      case '1-week':
        this.props.dispatch(selectTimeFilter(d.getTime() - (1000 * 60 * 60 * 24 * 7), d.getTime()));
        break;
      case '2-weeks':
        this.props.dispatch(selectTimeFilter(d.getTime() - (1000 * 60 * 60 * 24 * 14), d.getTime()));
        break;
      case 'custom':
        this.setState({
          showPicker: true,
          start: this.props.filter.start,
          end: this.props.filter.end,
        });
        break;
    }
  }

  handleClose() {
    this.setState({
      showPicker: false,
    });
  }

  changeStart(event) {
    if (event.target.valueAsDate) {
      this.setState({
        start: new Date(event.target.valueAsDate.getUTCFullYear(), event.target.valueAsDate.getUTCMonth(), event.target.valueAsDate.getUTCDate()).getTime(),
      });
    }
  }

  changeEnd(event) {
    if (event.target.valueAsDate) {
      this.setState({
        end: new Date(event.target.valueAsDate.getUTCFullYear(), event.target.valueAsDate.getUTCMonth(), event.target.valueAsDate.getUTCDate(),23,59,59).getTime(),
      });
    }
  }

  handleSave() {
    this.props.dispatch(selectTimeFilter(this.state.start, this.state.end));
    this.setState({
      showPicker: false,
      start: null,
      end: null,
    });
  }

  selectedOption() {
    const timeRange = this.props.filter.end - this.props.filter.start;

    if (Math.abs(this.props.filter.end - Date.now()) < 1000 * 60 * 60) {
      // ends right around now
      if (timeRange === 1000 * 60 * 60 * 24 * 14) {
        return '2-weeks';
      } if (timeRange === 1000 * 60 * 60 * 24 * 7) {
        return '1-week';
      } if (timeRange === 1000 * 60 * 60 * 24) {
        return '24-hours';
      }
    }

    return 'custom';
  }

  customText() {
    const { filter } = this.props;
    const start = dayjs(filter.start).format('MMM D');
    const end = dayjs(filter.end).format('MMM D');
    let text = `Custom: ${start}`;
    if (start !== end) text += ` - ${end}`;
    return text;
  }

  lastWeekText() {
    const weekAgo = dayjs().subtract(1, 'week');
    return `Last week (since ${weekAgo.format('MMM D')})`;
  }

  last2WeeksText() {
    const twoWeeksAgo = dayjs().subtract(14, 'day');
    return `Last 2 weeks (since ${twoWeeksAgo.format('MMM D')})`;
  }

  onVisible() {
    const filter = getDefaultFilter();
    this.props.dispatch(selectTimeFilter(filter.start, filter.end));
  }

  render() {
    const { classes } = this.props;
    const minDate = dayjs().subtract(LOOKBACK_WINDOW_MILLIS, 'millisecond').format('YYYY-MM-DD');
    const maxDate = dayjs().format('YYYY-MM-DD');
    const startDate = dayjs(this.state.start || this.props.filter.start).format('YYYY-MM-DD');
    const endDate = dayjs(this.state.end || this.props.filter.end).format('YYYY-MM-DD');

    return (
      <>
        <VisibilityHandler onVisible={ this.onVisible } minInterval={ 300 } resetOnHidden />
        <FormControl>
          <Select
            name="timerange"
            value={this.selectedOption()}
            onChange={this.handleSelectChange}
            className={classes.headerDropdown}
          >
            <MenuItem value="custom">{this.customText()}</MenuItem>
            <MenuItem value="24-hours">Last 24 Hours</MenuItem>
            <MenuItem value="1-week">{this.lastWeekText()}</MenuItem>
            <MenuItem value="2-weeks">{this.last2WeeksText()}</MenuItem>
          </Select>
        </FormControl>
        <Modal
          aria-labelledby="simple-modal-title"
          aria-describedby="simple-modal-description"
          open={this.state.showPicker}
          onClose={this.handleClose}
        >
          <Paper className={classes.modal}>
            <div className={ classes.datePickerContainer }>
              <Typography variant="body2">Start date:</Typography>
              <input
                label="Start date"
                type="date"
                min={ minDate }
                max={ maxDate }
                onChange={this.changeStart}
                value={ startDate }
              />
            </div>
            <div className={ classes.datePickerContainer }>
              <Typography variant="body2">End date:</Typography>
              <input
                label="End date"
                type="date"
                min={ startDate }
                max={ maxDate }
                onChange={this.changeEnd}
                value={ endDate }
              />
            </div>
            <Divider />
            <div className={classes.buttonGroup}>
              <Button variant="contained" className={ classes.cancelButton } onClick={this.handleClose}>
                Cancel
              </Button>
              &nbsp;
              <Button variant="contained" className={ classes.saveButton } onClick={this.handleSave}>
                Save
              </Button>
            </div>
          </Paper>
        </Modal>
      </>
    );
  }
}

const stateToProps = Obstruction({
  filter: 'filter',
});

export default connect(stateToProps)(withStyles(styles)(TimeSelect));
