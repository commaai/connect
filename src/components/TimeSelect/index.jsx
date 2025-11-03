import { Button, Divider, Modal, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectTimeFilter } from '../../actions';
import Colors from '../../colors';

const StyledPaper = styled(Paper)(({ theme }) => ({
  position: 'absolute',
  padding: theme.spacing(2),
  width: theme.spacing(50),
  maxWidth: '90%',
  margin: '0 auto',
  left: '50%',
  top: '40%',
  transform: 'translate(-50%, -50%)',
  outline: 'none',
}));

const ButtonGroup = styled('div')(({ theme }) => ({
  marginTop: 20,
  textAlign: 'right',
}));

const DatePickerContainer = styled('div')({
  display: 'flex',
  marginBottom: 20,
  '& aside': { width: 100 },
});

const CancelButton = styled(Button)({
  backgroundColor: Colors.grey200,
  color: Colors.white,
  '&:hover': {
    backgroundColor: Colors.grey400,
  },
});

const SaveButton = styled(Button)({
  backgroundColor: Colors.white,
  color: Colors.grey800,
  '&:hover': {
    backgroundColor: Colors.white70,
  },
});

const LOOKBACK_WINDOW_MILLIS = 365 * 24 * 3600 * 1000; // 30 days

const TimeSelect = (props) => {
  const { isOpen, onClose } = props;
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
      <StyledPaper>
        <DatePickerContainer>
          <Typography variant="body2">Start date:</Typography>
          <input label="Start date" type="date" min={minDate} max={maxDate} onChange={changeStart} value={startDate} />
        </DatePickerContainer>
        <DatePickerContainer>
          <Typography variant="body2">End date:</Typography>
          <input label="End date" type="date" min={startDate} max={maxDate} onChange={changeEnd} value={endDate} />
        </DatePickerContainer>
        <Divider />
        <ButtonGroup>
          <CancelButton variant="contained" onClick={handleClose}>
            Cancel
          </CancelButton>
          &nbsp;
          <SaveButton variant="contained" onClick={handleSave}>
            Save
          </SaveButton>
        </ButtonGroup>
      </StyledPaper>
    </Modal>
  );
};

export default TimeSelect;
