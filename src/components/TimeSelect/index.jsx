import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import dayjs from 'dayjs';
import PropTypes from 'prop-types';

import { Button, Divider, Modal, Paper, Typography, withStyles } from '@material-ui/core';

import Colors from '../../colors';
import { selectTimeFilter } from '../../actions';

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
      start: null,
      end: null,
    }

    this.handleClose = this.handleClose.bind(this);
    this.changeStart = this.changeStart.bind(this);
    this.changeEnd = this.changeEnd.bind(this);
    this.handleSave = this.handleSave.bind(this);
  }

  componentDidMount() {
    this.setState({
      start: this.props.filter.start,
      end: this.props.filter.end,
    });
  }

  componentDidUpdate(prevProps) {
    if (prevProps.filter !== this.props.filter) {
      this.setState({
        start: this.props.filter.start,
        end: this.props.filter.end,
      });
    }
  }

  handleClose() {
    this.props.onClose()
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
    console.log({start: this.state.start, end: this.state.end})
    this.props.dispatch(selectTimeFilter(this.state.start, this.state.end));
    this.props.onClose()
  }

  render() {
    const { classes, isOpen } = this.props;
    const minDate = dayjs().subtract(LOOKBACK_WINDOW_MILLIS, 'millisecond').format('YYYY-MM-DD');
    const maxDate = dayjs().format('YYYY-MM-DD');
    const startDate = dayjs(this.state.start || this.props.filter.start).format('YYYY-MM-DD');
    const endDate = dayjs(this.state.end || this.props.filter.end).format('YYYY-MM-DD');

    return (
      <>
        <Modal
          aria-labelledby="simple-modal-title"
          aria-describedby="simple-modal-description"
          open={isOpen}
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

TimeSelect.propTypes = {
  onClose: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
};

export default connect(stateToProps)(withStyles(styles)(TimeSelect));
