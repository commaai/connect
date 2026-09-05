import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { Button, Divider, Modal, Paper, Typography, withStyles } from '@material-ui/core';

import Colors from '../../colors';
import { selectTimeFilter } from '../../actions';

const styles = (theme) => ({
  modalContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
    maxWidth: '90%',
    outline: 'none',
  },
  buttonGroup: {
    marginTop: 20,
    textAlign: 'right',
  },
  datePickerContainer: {
    display: 'flex',
    marginBottom: 20,
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

class TimeSelect extends Component {
  constructor(props) {
    super(props);

    this.state = {
      start: dayjs(props.filter.start).format('YYYY-MM-DD'),
      end: dayjs(props.filter.end).format('YYYY-MM-DD'),
    }

    this.changeStart = this.changeStart.bind(this);
    this.changeEnd = this.changeEnd.bind(this);
    this.handleSave = this.handleSave.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.filter !== this.props.filter) {
      this.setState({
        start: dayjs(this.props.filter.start).format('YYYY-MM-DD'),
        end: dayjs(this.props.filter.end).format('YYYY-MM-DD'),
      });
    }
  }

  changeStart(event) {
    if (event.target.value) {
      this.setState(state => ({
        start: event.target.value,
        end: state.end < event.target.value ? event.target.value : state.end,
      }));
    }
  }

  changeEnd(event) {
    if (event.target.value) {
      this.setState(state => ({
        end: event.target.value < state.start ? state.start : event.target.value,
      }));
    }
  }

  handleSave() {
    const start = dayjs(this.state.start).startOf('day').valueOf();
    const end = dayjs(this.state.end).endOf('day').valueOf();

    this.props.dispatch(selectTimeFilter(start, end));
    this.props.onClose()
  }

  render() {
    const { classes, isOpen, onClose } = this.props;
    const minDate = dayjs().subtract(365, 'day').format('YYYY-MM-DD');
    const maxDate = dayjs().format('YYYY-MM-DD');

    return (
      <Modal
        open={isOpen}
        onClose={onClose}
        className={classes.modalContainer}
      >
        <Paper className={classes.modal}>
          <div className={ classes.datePickerContainer }>
            <Typography variant="body2">Start date:</Typography>
            <input
              type="date"
              min={ minDate }
              max={ maxDate }
              onChange={this.changeStart}
              value={ this.state.start }
            />
          </div>
          <div className={ classes.datePickerContainer }>
            <Typography variant="body2">End date:</Typography>
            <input
              type="date"
              min={ this.state.start }
              max={ maxDate }
              onChange={this.changeEnd}
              value={ this.state.end }
            />
          </div>
          <Divider />
          <div className={classes.buttonGroup}>
            <Button variant="contained" className={ classes.cancelButton } onClick={onClose}>
              Cancel
            </Button>
            &nbsp;
            <Button variant="contained" className={ classes.saveButton } onClick={this.handleSave}>
              Save
            </Button>
          </div>
        </Paper>
      </Modal>
    );
  }
}

const stateToProps = (state) => ({
  filter: state.filter,
});

export default connect(stateToProps)(withStyles(styles)(TimeSelect));
