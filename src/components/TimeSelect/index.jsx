import { useState } from 'react';
import { connect } from 'react-redux';

import { Button, Divider, Modal, Paper, Typography, withStyles } from '@material-ui/core';

import Colors from '../../colors';
import { selectTimeFilter } from '../../actions';

const styles = {
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
};

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDate = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const TimeSelect = ({ classes, onClose, filter, dispatch }) => {
  const [start, setStart] = useState(formatDate(new Date(filter.start)));
  const [end, setEnd] = useState(formatDate(new Date(filter.end)));

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
      parseDate(start).setHours(0, 0, 0, 0),
      parseDate(end).setHours(23, 59, 59, 999),
    ));
    onClose();
  };

  const max = new Date();
  const min = new Date(max);
  min.setDate(min.getDate() - 365);

  const minDate = formatDate(min);
  const maxDate = formatDate(max);

  return (
    <Modal open onClose={onClose} className="flex items-center justify-center">
      <Paper className="p-4 outline-none">
        <div className="flex flex-col xs:flex-row gap-6 justify-between mb-5">
          <div className="flex w-30 flex-col gap-1.5">
            <Typography variant="subheading">Start date:</Typography>
            <input
              className="w-full box-border"
              type="date"
              min={minDate}
              max={maxDate}
              onChange={changeStart}
              value={start}
            />
          </div>
          <div className="flex w-30 flex-col gap-1.5">
            <Typography variant="subheading">End date:</Typography>
            <input
              className="w-full box-border"
              type="date"
              min={start}
              max={maxDate}
              onChange={changeEnd}
              value={end}
            />
          </div>
        </div>
        <Divider />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="contained" className={classes.cancelButton} onClick={onClose}>
            Cancel
          </Button>
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
