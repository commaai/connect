import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { IconButton, Typography } from '@material-ui/core';

import { pushTimelineRange } from '../../actions';
import { CloseBold } from '../../icons';
import { filterRegularClick } from '../../utils';

import Media from './Media';

class DriveView extends Component {
  constructor(props) {
    super(props);
    this.close = this.close.bind(this);
  }

  close() {
    this.props.dispatch(pushTimelineRange(null, null, null));
  }

  render() {
    const { dongleId, currentRoute, routes } = this.props;

    if (!currentRoute) {
      return (
        <div className="DriveView p-8">
          <Typography>{routes === null ? 'Loading...' : 'Route does not exist.'}</Typography>
        </div>
      );
    }

    // FIXME: end time not always same day as start time
    const start = currentRoute.start_time_utc_millis;
    const startDateObj = dayjs(start);
    const startDay = startDateObj.format('dddd');
    const startTime = startDateObj.format(`MMM D${dayjs().year() === startDateObj.year() ? '' : ', YYYY'} @ HH:mm`);
    const endTime = dayjs(start + currentRoute.duration).format('HH:mm');

    return (
      <div className="DriveView">
        <div className="flex flex-col gap-4 rounded-lg m-4 bg-[linear-gradient(to_bottom,#30373B_0%,#272D30_10%,#1D2225_100%)]">
          <div className="items-center justify-between flex p-3 gap-2">
            <div className="w-12" />
            <div className="flex flex-col items-center gap-1 text-white text-lg font-medium">
              {currentRoute.demo_title ? (
                <div className="w-fit rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                  {currentRoute.demo_title}
                </div>
              ) : null}
              <div>
                <span className="hidden sm:inline">{`${startDay} `}</span>
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
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveView);
