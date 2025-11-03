import { Box, Grid, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

import { pushTimelineRange } from '../../actions';
import { fetchEvents, fetchLocations } from '../../actions/cached';
import Colors from '../../colors';
import { useWindowWidth } from '../../hooks/window';
import { RightArrow } from '../../icons';
import { filterRegularClick, formatDriveDuration } from '../../utils';
import { isMetric, KM_PER_MI } from '../../utils/conversions';
import Timeline from '../Timeline';

const DriveLink = styled('a')({
  background: 'linear-gradient(to bottom, #30373B 0%, #1D2225 100%)',
  borderTop: '1px solid rgba(255, 255, 255, .05)',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  marginBottom: 12,
  overflow: 'hidden',
  padding: 0,
  transition: 'background .2s',
  textDecoration: 'none',
  '&:hover': {},
});

const DriveListItem = (props) => {
  const dispatch = useDispatch();
  const el = useRef();
  const [isVisible, setVisible] = useState(false);
  const windowWidth = useWindowWidth();
  const { drive } = props;

  useEffect(() => {
    const onScroll = () => {
      if (!isVisible && el.current && window && (!window.visualViewport || window.visualViewport.height >= el.current.getBoundingClientRect().y - 300)) {
        setVisible(true);
        dispatch(fetchEvents(drive));
        dispatch(fetchLocations(drive));

        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    };

    window.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onScroll);
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [drive, dispatch, isVisible]);

  const onClick = filterRegularClick(() => dispatch(pushTimelineRange(drive.log_id, 0, drive.duration, true)));

  const small = windowWidth < 580;
  const dateFormat = small ? 'ddd, MMM D' : 'dddd, MMM D';
  const startDateObj = dayjs(drive.start_time_utc_millis);
  const startTime = startDateObj.format('HH:mm');
  const startDate = startDateObj.format(dayjs().year() === startDateObj.year() ? dateFormat : `${dateFormat}, YYYY`);
  const endTime = dayjs(drive.end_time_utc_millis).format('HH:mm');
  const duration = formatDriveDuration(drive.duration);

  const distance = isMetric() ? `${+(drive.distance * KM_PER_MI).toFixed(1)} km` : `${+drive.distance.toFixed(1)} mi`;

  /* eslint-disable key-spacing, no-multi-spaces */
  const gridStyle = small
    ? {
        date: { order: 1, maxWidth: '72%', flexBasis: '72%', marginBottom: 12 },
        dur: { order: 2, maxWidth: '28%', flexBasis: '28%', marginBottom: 12 },
        origin: { order: 3, maxWidth: '50%', flexBasis: '50%' },
        dest: { order: 4, maxWidth: '50%', flexBasis: '50%' },
      }
    : {
        date: { order: 1, maxWidth: '28%', flexBasis: '26%' },
        dur: { order: 2, maxWidth: '14%', flexBasis: '14%' },
        origin: { order: 3, maxWidth: '26%', flexBasis: '22%' },
        dest: { order: 4, maxWidth: '26%', flexBasis: '22%' },
        arrow: { order: 5, maxWidth: '6%', flexBasis: '6%' },
      };
  /* eslint-enable key-spacing, no-multi-spaces */

  return (
    <DriveLink key={drive.fullname} className="DriveEntry" ref={el} href={`/${drive.dongle_id}/${drive.log_id}`} onClick={onClick}>
      <Box sx={{ alignItems: 'center', padding: !small ? '18px 32px' : '18px' }}>
        <Grid container>
          <Box sx={{ flexGrow: 1, ...gridStyle.date }}>
            <Typography sx={{ fontWeight: 600 }}>{startDate}</Typography>
            <Typography>{`${startTime} to ${endTime}`}</Typography>
          </Box>
          <Box sx={{ flexGrow: 1, ...(small && { textAlign: 'right' }), ...gridStyle.dur }}>
            <Typography sx={{ fontWeight: 600 }}>{duration}</Typography>
            <Typography>{distance}</Typography>
          </Box>
          <Box sx={{ flexGrow: 1, ...gridStyle.origin }}>
            <Typography sx={{ fontWeight: 600 }}>{drive.startLocation?.place}</Typography>
            <Typography>{drive.startLocation?.details}</Typography>
          </Box>
          <Box sx={{ flexGrow: 1, ...(small && { textAlign: 'right' }), ...gridStyle.dest }}>
            <Typography sx={{ fontWeight: 600 }}>{drive.endLocation?.place}</Typography>
            <Typography>{drive.endLocation?.details}</Typography>
          </Box>
          {!small && (
            <Box sx={{ flexGrow: 1, ...gridStyle.arrow }}>
              <RightArrow sx={{ color: Colors.grey500, height: '100%', marginLeft: '25%', width: 32 }} />
            </Box>
          )}
        </Grid>
      </Box>
      <Timeline route={drive} thumbnailsVisible={isVisible} zoomOverride={{ start: 0, end: drive.duration }} />
    </DriveLink>
  );
};

export default DriveListItem;
