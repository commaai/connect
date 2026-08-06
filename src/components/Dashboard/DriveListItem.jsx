import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { Grid, Typography } from '@material-ui/core';

import { pushTimelineRange } from '../../actions';
import { fetchEvents, fetchLocations } from '../../actions/cached';
import { useWindowWidth } from '../../hooks/window';
import { Bookmark, RightArrow } from '../../icons';
import { formatDriveDuration, filterRegularClick } from '../../utils';
import { isMetric, KM_PER_MI } from '../../utils/conversions';
import Timeline from '../Timeline';

const DriveListItem = (props) => {
  const el = useRef();
  const [isVisible, setVisible] = useState(false);
  const windowWidth = useWindowWidth();
  const { dispatch, drive } = props;

  useEffect(() => {
    const onScroll = () => {
      if (!isVisible && el.current && window && (!window.visualViewport
          || window.visualViewport.height >= el.current.getBoundingClientRect().y - 300)
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
  }, [drive, dispatch, isVisible, el]);

  const onClick = filterRegularClick(
    () => dispatch(pushTimelineRange(drive.log_id, 0, drive.duration, true)),
  );

  const small = windowWidth < 580;
  const dateFormat = small ? 'ddd, MMM D' : 'dddd, MMM D';
  const startDateObj = dayjs(drive.start_time_utc_millis);
  const startTime = startDateObj.format('HH:mm');
  const startDate = startDateObj.format(dayjs().year() === startDateObj.year() ? dateFormat : `${dateFormat}, YYYY`);
  const endTime = dayjs(drive.end_time_utc_millis).format('HH:mm');
  const duration = formatDriveDuration(drive.duration);

  const distance = isMetric()
    ? `${+(drive.distance * KM_PER_MI).toFixed(1)} km`
    : `${+drive.distance.toFixed(1)} mi`;

  const gridClasses = small ? {
    date: 'order-1 max-w-[72%] basis-[72%] mb-3',
    dur: 'order-2 max-w-[28%] basis-[28%] mb-3',
    origin: 'order-3 max-w-1/2 basis-1/2',
    dest: 'order-4 max-w-1/2 basis-1/2',
  } : {
    date: 'order-1 max-w-[28%] basis-[26%]',
    dur: 'order-2 max-w-[14%] basis-[14%]',
    origin: 'order-3 max-w-[26%] basis-[22%]',
    dest: 'order-4 max-w-[26%] basis-[22%]',
    arrow: 'order-5 max-w-[6%] basis-[6%]',
  };

  return (
    <div className="relative mb-3">
      {drive.is_preserved && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-px -top-px right-0 h-[9px] rounded-t-[9px] bg-[linear-gradient(to_right,white_0%,rgba(255,255,255,.5)_64px,transparent_192px)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-px -top-px bottom-0 w-[9px] rounded-l-[9px] bg-[linear-gradient(to_bottom,white_0%,rgba(255,255,255,.5)_32px,transparent_96px)]"
          />
        </>
      )}
      <a
        className="DriveEntry relative z-10 flex flex-col overflow-hidden p-0 rounded-lg bg-[linear-gradient(to_bottom,#30373B_0%,#1D2225_100%)] no-underline transition-[background] duration-200"
        ref={el}
        href={`/${drive.dongle_id}/${drive.log_id}`}
        onClick={onClick}
      >
        {drive.is_preserved && (
          <span
            aria-label="Bookmarked drive"
            role="img"
            className="pointer-events-none absolute left-1.5 top-1.5 z-20 flex items-center justify-center text-white"
          >
            <Bookmark aria-hidden="true" className="text-sm" />
          </span>
        )}
        <div className={`items-center ${small ? 'p-[18px]' : 'py-[18px] px-8'}`}>
          <Grid container>
            <div className={`grow ${gridClasses.date}`}>
              <Typography className="flex items-center font-semibold gap-1.5">
                {startDate}
              </Typography>
              <Typography>{`${startTime} to ${endTime}`}</Typography>
            </div>
            <div className={`grow ${small ? 'text-right' : ''} ${gridClasses.dur}`}>
              <Typography className="flex items-center font-semibold gap-1.5">{duration}</Typography>
              <Typography>{distance}</Typography>
            </div>
            <div className={`grow ${gridClasses.origin}`}>
              <Typography className="flex items-center font-semibold gap-1.5">{drive.startLocation?.place}</Typography>
              <Typography>{drive.startLocation?.details}</Typography>
            </div>
            <div className={`grow ${small ? 'text-right' : ''} ${gridClasses.dest}`}>
              <Typography className="flex items-center font-semibold gap-1.5">{drive.endLocation?.place}</Typography>
              <Typography>{drive.endLocation?.details}</Typography>
            </div>
            {!small && (
              <div className={`grow ${gridClasses.arrow}`}>
                <RightArrow className="text-[#424a4f] h-full ml-[25%] w-8" />
              </div>
            )}
          </Grid>
        </div>
        <Timeline
          route={drive}
          thumbnailsVisible={isVisible}
          zoomOverride={{ start: 0, end: drive.duration }}
        />
      </a>
    </div>
  );
};

export default connect(() => ({}))(DriveListItem);
