import { useState } from 'react';
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
    width: theme.spacing.unit * 42,
    maxWidth: '90%',
    outline: 'none',
  },
  buttonGroup: {
    marginTop: 20,
    textAlign: 'right',
  },
  datePickerContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  dateField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: 135,
  },
  dateInput: {
    width: '100%',
    boxSizing: 'border-box',
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

const TimeSelect = (props) => {
  const { classes, onClose, filter, dispatch } = props;

  const [start, setStart] = useState(dayjs(filter.start).format('YYYY-MM-DD'));
  const [end, setEnd] = useState(dayjs(filter.end).format('YYYY-MM-DD'));

  const changeStart = (event) => {
    if (event.target.value) {
      setStart(event.target.value);
      setEnd(current => (
        current < event.target.value ? event.target.value : current
      ));
    }
  };

  const changeEnd = (event) => {
    if (event.target.value) {
      setEnd(event.target.value < start ? start : event.target.value);
    }
  };

  const handleSave = () => {
    dispatch(selectTimeFilter(
      dayjs(start).startOf('day').valueOf(),
      dayjs(end).endOf('day').valueOf(),
    ));
    onClose();
  };

  const minDate = dayjs().subtract(365, 'day').format('YYYY-MM-DD');
  const maxDate = dayjs().format('YYYY-MM-DD');

  return (
    <Modal
      open
      onClose={onClose}
      className={classes.modalContainer}
    >
      <Paper className={classes.modal}>
        <div className={classes.datePickerContainer}>
          <div className={classes.dateField}>
            <Typography variant="body2">Start date:</Typography>
            <input
              className={classes.dateInput}
              type="date"
              min={minDate}
              max={maxDate}
              onChange={changeStart}
              value={start}
            />
          </div>
          <div className={classes.dateField}>
            <Typography variant="body2">End date:</Typography>
            <input
              className={classes.dateInput}
              type="date"
              min={start}
              max={maxDate}
              onChange={changeEnd}
              value={end}
            />
          </div>
        </div>
        <Divider />
        <div className={classes.buttonGroup}>
          <Button variant="contained" className={classes.cancelButton} onClick={onClose}>
            Cancel
          </Button>
          &nbsp;
          <Button variant="contained" className={classes.saveButton} onClick={handleSave}>
            Save
          </Button>
        </div>
      </Paper>
    </Modal>
  );
};

const stateToProps = (state) => ({
  filter: state.filter,
});

export default connect(stateToProps)(withStyles(styles)(TimeSelect));
