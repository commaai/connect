import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { IconButton, Typography } from '@material-ui/core';

import { popTimelineRange, pushTimelineRange } from '../../actions';
import { ArrowBackBold, CloseBold, HomeBold } from '../../icons';
import { filterRegularClick } from '../../utils';

import Media from './Media';
import Timeline from '../Timeline';

class DriveView extends Component {
  constructor(props) {
    super(props);
    this.close = this.close.bind(this);
  }

  onBack(zoom, currentRoute) {
    if (zoom.previous) {
      this.props.dispatch(popTimelineRange(currentRoute?.log_id));
    } else if (currentRoute) {
      this.props.dispatch(
        pushTimelineRange(currentRoute.log_id, null, null),
      );
    }
  }

  close() {
    this.props.dispatch(pushTimelineRange(null, null, null));
  }

  render() {
    const { dongleId, zoom, currentRoute, routes } = this.props;

    if (!currentRoute) {
      return (
        <div className="DriveView p-8">
          <Typography>{routes === null ? 'Loading...' : 'Route does not exist.'}</Typography>
        </div>
      );
    }

    const currentRouteBoundsSelected = zoom.start === 0 && zoom.end === currentRoute.duration;

    // FIXME: end time not always same day as start time
    // A selected section is often under a minute, so show its seconds.
    const timeFormat = currentRouteBoundsSelected ? 'HH:mm' : 'HH:mm:ss';
    const start = currentRoute.start_time_utc_millis + zoom.start;
    const startDateObj = dayjs(start);
    const startDay = startDateObj.format('dddd');
    const startDate = startDateObj.format(`MMM D${dayjs().year() === startDateObj.year() ? '' : ', YYYY'}`);
    const startTime = startDateObj.format(timeFormat);
    const endTime = dayjs(start + (zoom.end - zoom.start)).format(timeFormat);

    return (
      <div className="DriveView">
        <div className="flex flex-col gap-4 rounded-lg m-4 bg-[linear-gradient(to_bottom,#30373B_0%,#272D30_10%,#1D2225_100%)]">
          <div>
            <div className="items-center justify-between flex p-3 gap-2">
              {currentRouteBoundsSelected ? (
                <IconButton
                  onClick={ filterRegularClick(this.close) }
                  aria-label="Home"
                  href={ `/${dongleId}` }
                >
                  <HomeBold />
                </IconButton>
              ) : (
                <IconButton
                  onClick={ () => this.onBack(zoom, currentRoute) }
                  aria-label="Go Back"
                >
                  <ArrowBackBold />
                </IconButton>
              )}
              <div className="flex flex-col items-center gap-1 text-white text-lg font-medium">
                {currentRoute.demo_title ? (
                  <div className="w-fit rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                    {currentRoute.demo_title}
                  </div>
                ) : null}
                <div>
                  <span className="hidden sm:inline">{`${startDay} `}</span>
                  {/* On phones a section's seconds need the room; the date is the drive's. */}
                  <span className={currentRouteBoundsSelected ? undefined : 'hidden xs:inline'}>{`${startDate} @ `}</span>
                  {`${startTime} - ${endTime}`}
                </div>
              </div>
              <IconButton
                onClick={ filterRegularClick(this.close) }
                aria-label="Close"
                href={ `/${dongleId}` }
              >
                <CloseBold />
              </IconButton>
            </div>
            <Timeline route={currentRoute} thumbnailsVisible hasRuler />
          </div>
          <div className='px-3 pb-3 md:px-8 md:pb-8'>
            {(routes && routes.length === 0)
              ? <Typography>Route does not exist.</Typography>
              : <Media />}
          </div>
        </div>
      </div>
    );
  }
}

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  routes: state.routes,
  zoom: state.zoom,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveView);
