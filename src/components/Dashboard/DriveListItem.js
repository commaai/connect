import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import fecha from 'fecha';

import { withStyles, Grid, Typography } from '@material-ui/core';

import { selectRange } from '../../actions';
import { fetchEvents, fetchLocations } from '../../actions/cached';
import Colors from '../../colors';
import { RightArrow } from '../../icons';
import { formatDriveDuration, filterRegularClick } from '../../utils';
import { isMetric, KM_PER_MI } from '../../utils/conversions';
import Timeline from '../Timeline';

const styles = () => ({
  drive: {
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
  },
  driveHeader: {
    alignItems: 'center',
  },
  driveHeaderIntro: {
    display: 'flex',
  },
  driveGridItem: {
    flexGrow: 1,
  },
  driveGridItemRightAlign: {
    textAlign: 'right',
  },
  driveHeaderIntroSmall: {
    justifyContent: 'center',
  },
  driveTimeline: {},
  driveArrow: {
    color: Colors.grey500,
    height: '100%',
    marginLeft: '25%',
    width: 32,
  },
  firstLine: {
    fontWeight: 600,
  },
});

const DriveListItem = (props) => {
  const ref = React.createRef();
  const [isVisible, setVisible] = useState(false);
  const { classes, dispatch, drive, windowWidth } = props;

  useEffect(() => {
    const onScroll = () => {
      if (!isVisible && ref.current && window && (!window.visualViewport
          || window.visualViewport.height >= ref.current.getBoundingClientRect().y - 300)
      ) {
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
  }, []);

  const onClick = filterRegularClick(() =>
    dispatch(selectRange(drive.start_time_utc_millis, drive.end_time_utc_millis)));

  const small = windowWidth < 580;
  const startTime = fecha.format(new Date(drive.start_time_utc_millis), 'HH:mm');
  const startDate = fecha.format(new Date(drive.start_time_utc_millis), small ? 'ddd, MMM D' : 'dddd, MMM D');
  const endTime = fecha.format(new Date(drive.end_time_utc_millis), 'HH:mm');
  const duration = formatDriveDuration(drive.duration);

  const distance = isMetric()
    ? `${+(drive.length * KM_PER_MI).toFixed(1)} km`
    : `${+drive.length.toFixed(1)} mi`;

  /* eslint-disable key-spacing, no-multi-spaces */
  const gridStyle = small ? {
    date:   { order: 1, maxWidth: '72%', flexBasis: '72%', marginBottom: 12 },
    dur:    { order: 2, maxWidth: '28%', flexBasis: '28%', marginBottom: 12 },
    origin: { order: 3, maxWidth: '50%', flexBasis: '50%' },
    dest:   { order: 4, maxWidth: '50%', flexBasis: '50%' },
  } : {
    date:   { order: 1, maxWidth: '28%', flexBasis: '26%' },
    dur:    { order: 2, maxWidth: '14%', flexBasis: '14%' },
    origin: { order: 3, maxWidth: '26%', flexBasis: '22%' },
    dest:   { order: 4, maxWidth: '26%', flexBasis: '22%' },
    arrow:  { order: 5, maxWidth: '6%',  flexBasis: '6%'  },
  };
  /* eslint-enable key-spacing, no-multi-spaces */

  return (
    <a
      key={drive.start_time}
      className={`${classes.drive} DriveEntry`}
      ref={ref}
      href={`/${drive.dongle_id}/${drive.start_time_utc_millis}/${drive.end_time_utc_millis}`}
      onClick={onClick}
    >
      <div className={classes.driveHeader} style={!small ? { padding: '18px 32px' } : { padding: 18 }}>
        <Grid container>
          <div className={classes.driveGridItem} style={gridStyle.date}>
            <Typography className={classes.firstLine}>{startDate}</Typography>
            <Typography>{`${startTime} to ${endTime}`}</Typography>
          </div>
          <div className={`${classes.driveGridItem} ${small && classes.driveGridItemRightAlign}`} style={gridStyle.dur}>
            <Typography className={classes.firstLine}>{duration}</Typography>
            <Typography>{distance}</Typography>
          </div>
          <div className={classes.driveGridItem} style={gridStyle.origin}>
            <Typography className={classes.firstLine}>{drive.startLocation?.place}</Typography>
            <Typography>{drive.startLocation?.details}</Typography>
          </div>
          <div className={`${classes.driveGridItem} ${small && classes.driveGridItemRightAlign}`} style={gridStyle.dest}>
            <Typography className={classes.firstLine}>{drive.endLocation?.place}</Typography>
            <Typography>{drive.endLocation?.details}</Typography>
          </div>
          {!small && (
            <div className={classes.driveGridItem} style={gridStyle.arrow}>
              <RightArrow className={classes.driveArrow} />
            </div>
          )}
        </Grid>
      </div>
      <Timeline
        className={classes.driveTimeline}
        thumbnailsVisible={isVisible}
        zoomOverride={{ start: drive.start_time_utc_millis, end: drive.end_time_utc_millis }}
      />
    </a>
  );
};

export default connect(() => ({}))(withStyles(styles)(DriveListItem));
