import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';

import { IconButton, Typography } from '@material-ui/core';

import { zoomOut } from '../../actions/history';
import { selectedDrive } from '../../timeline/segments';
import { urlForDestination } from '../../url';
import { ArrowBackBold, CloseBold } from '../../icons';

import Media from './Media';
import Timeline from '../Timeline';

class DriveView extends Component {
  render() {
    const { dongleId, zoom, currentRoute, missing } = this.props;

    if (!currentRoute) {
      return (
        <div className="DriveView p-8">
          <Typography>{missing ? 'Route does not exist.' : 'Loading...'}</Typography>
        </div>
      );
    }

    const backButtonDisabled = zoom.start === 0 && zoom.end === currentRoute.duration;

    // FIXME: end time not always same day as start time
    const start = currentRoute.start_time_utc_millis + zoom.start;
    const startDateObj = dayjs(start);
    const startDay = startDateObj.format('dddd');
    const startTime = startDateObj.format(`MMM D${dayjs().year() === startDateObj.year() ? '' : ', YYYY'} @ HH:mm`);
    const endTime = dayjs(start + (zoom.end - zoom.start)).format('HH:mm');

    return (
      <div className="DriveView">
        <div className="flex flex-col gap-4 rounded-lg m-4 bg-[linear-gradient(to_bottom,#30373B_0%,#272D30_10%,#1D2225_100%)]">
          <div>
            <div className="items-center justify-between flex p-3 gap-2">
              <IconButton
                onClick={ () => this.props.dispatch(zoomOut()) }
                aria-label="Go Back"
                disabled={ backButtonDisabled }
              >
                <ArrowBackBold />
              </IconButton>
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
              <IconButton component={ Link } aria-label="Close" to={ urlForDestination({ page: 'dashboard', dongleId }) }>
                <CloseBold />
              </IconButton>
            </div>
            <Timeline route={currentRoute} thumbnailsVisible hasRuler />
          </div>
          <div className='px-3 pb-3 md:px-8 md:pb-8'>
            <Media />
          </div>
        </div>
      </div>
    );
  }
}

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  missing: selectedDrive(state) === null,
  zoom: state.zoom,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveView);
