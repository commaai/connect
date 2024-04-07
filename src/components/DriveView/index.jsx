import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import dayjs from 'dayjs';

import { IconButton, Typography } from '@material-ui/core';

import { popTimelineRange, pushTimelineRange } from '../../actions';
import { ArrowBackBold, CloseBold } from '../../icons';
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
      this.props.dispatch(popTimelineRange());
    } else if (currentRoute) {
      this.props.dispatch(
        pushTimelineRange(currentRoute.start_time_utc_millis, currentRoute.end_time_utc_millis),
      );
    }
  }

  close() {
    this.props.dispatch(pushTimelineRange(null, null));
  }

  render() {
    const { dongleId, zoom, routes, currentRoute } = this.props;

    const currentRouteBoundsSelected = currentRoute?.start_time_utc_millis === zoom.start && currentRoute?.end_time_utc_millis === zoom.end;
    const backButtonDisabled = !zoom.previousZoom && currentRouteBoundsSelected;

    // FIXME: end time not always same day as start time
    const startDay = dayjs(zoom.start).format('dddd');
    const startTime = dayjs(zoom.start).format('MMM D @ HH:mm');
    const endTime = dayjs(zoom.end).format('HH:mm');

    return (
      <div className="DriveView">
        <div className="flex flex-col rounded-lg m-4 bg-[linear-gradient(to_bottom,#30373B_0%,#272D30_10%,#1D2225_100%)]">
          <div>
            <div className="items-center justify-between flex p-3 gap-2">
              <IconButton
                onClick={ () => this.onBack(zoom, currentRoute) }
                aria-label="Go Back"
                disabled={ backButtonDisabled }
              >
                <ArrowBackBold />
              </IconButton>
              <div className="text-white text-lg font-medium">
                <span className="hidden sm:inline">{`${startDay} `}</span>
                {`${startTime} - ${endTime}`}
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
          <div className="p-3 md:p-8">
            {(routes && routes.length === 0)
              ? <Typography>Route does not exist.</Typography>
              : <Media />}
          </div>
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  routes: 'routes',
  zoom: 'zoom',
  currentRoute: 'currentRoute',
});

export default connect(stateToProps)(DriveView);
