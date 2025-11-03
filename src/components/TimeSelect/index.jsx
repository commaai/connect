import { Button, Divider, Modal, Paper, Typography } from '@mui/material';
import { withStyles } from '@mui/styles';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectTimeFilter } from '../../actions';
import Colors from '../../colors';

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

const TimeSelect = (props) => {
  const { classes, isOpen, onClose } = props;
  const dispatch = useDispatch();
  const filter = useSelector((state) => state.filter);

  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);

  useEffect(() => {
    setStart(filter.start);
    setEnd(filter.end);
  }, [filter]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const changeStart = useCallback((event) => {
    if (event.target.valueAsDate) {
      setStart(new Date(event.target.valueAsDate.getUTCFullYear(), event.target.valueAsDate.getUTCMonth(), event.target.valueAsDate.getUTCDate()).getTime());
    }
  }, []);

  const changeEnd = useCallback((event) => {
    if (event.target.valueAsDate) {
      setEnd(new Date(event.target.valueAsDate.getUTCFullYear(), event.target.valueAsDate.getUTCMonth(), event.target.valueAsDate.getUTCDate(), 23, 59, 59).getTime());
    }
  }, []);

  const handleSave = useCallback(() => {
    console.log({ start, end });
    dispatch(selectTimeFilter(start, end));
    onClose();
  }, [start, end, dispatch, onClose]);

  const minDate = dayjs().subtract(LOOKBACK_WINDOW_MILLIS, 'millisecond').format('YYYY-MM-DD');
  const maxDate = dayjs().format('YYYY-MM-DD');
  const startDate = dayjs(start || filter.start).format('YYYY-MM-DD');
  const endDate = dayjs(end || filter.end).format('YYYY-MM-DD');

  return (
    <Modal aria-labelledby="simple-modal-title" aria-describedby="simple-modal-description" open={isOpen} onClose={handleClose}>
      <Paper className={classes.modal}>
        <div className={classes.datePickerContainer}>
          <Typography variant="body2">Start date:</Typography>
          <input label="Start date" type="date" min={minDate} max={maxDate} onChange={changeStart} value={startDate} />
        </div>
        <div className={classes.datePickerContainer}>
          <Typography variant="body2">End date:</Typography>
          <input label="End date" type="date" min={startDate} max={maxDate} onChange={changeEnd} value={endDate} />
        </div>
        <Divider />
        <div className={classes.buttonGroup}>
          <Button variant="contained" className={classes.cancelButton} onClick={handleClose}>
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

export default withStyles(styles)(TimeSelect);
