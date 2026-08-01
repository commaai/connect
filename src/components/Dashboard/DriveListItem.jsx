import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { pushTimelineRange } from '../../actions';
import { fetchEvents, fetchLocations } from '../../actions/cached';
import { useWindowWidth } from '../../hooks/window';
import { RightArrow } from '../../icons';
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
      key={drive.fullname}
      className="DriveEntry mb-3 flex flex-col overflow-hidden rounded-lg border-t border-content/5 bg-linear-to-b from-surface-raised to-surface p-0 no-underline transition-colors"
      ref={el}
      href={`/${drive.dongle_id}/${drive.log_id}`}
      onClick={onClick}
    >
      <div className="items-center" style={!small ? { padding: '18px 32px' } : { padding: 18 }}>
        <div className="flex w-full flex-wrap">
          <div className="grow" style={gridStyle.date}>
            <p className="font-semibold">{startDate}</p>
            <p>{`${startTime} to ${endTime}`}</p>
          </div>
          <div className={`grow ${small ? 'text-right' : ''}`} style={gridStyle.dur}>
            <p className="font-semibold">{duration}</p>
            <p>{distance}</p>
          </div>
          <div className="grow" style={gridStyle.origin}>
            <p className="font-semibold">{drive.startLocation?.place}</p>
            <p>{drive.startLocation?.details}</p>
          </div>
          <div className={`grow ${small ? 'text-right' : ''}`} style={gridStyle.dest}>
            <p className="font-semibold">{drive.endLocation?.place}</p>
            <p>{drive.endLocation?.details}</p>
          </div>
          {!small && (
            <div className="grow" style={gridStyle.arrow}>
              <RightArrow className="ml-[25%] h-full w-8 text-progress" />
            </div>
          )}
        </div>
      </div>
      <Timeline
        route={drive}
        thumbnailsVisible={isVisible}
        zoomOverride={{ start: 0, end: drive.duration }}
      />
    </a>
  );
};

export default connect()(DriveListItem);
