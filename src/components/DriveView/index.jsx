import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { Button, IconButton, Typography } from '@material-ui/core';

import { VIEWS, buildUrl, deviceBase, locationFor } from '../../routing/codec';
import { driveBack, toDashboard, toDrive } from '../../routing/navigate';
import { selectSelectedRouteMissing, selectSelectionOutOfRange } from '../../routing/selectors';
import { ArrowBackBold, CloseBold } from '../../icons';
import { filterRegularClick } from '../../utils';

import Media from './Media';
import Timeline from '../Timeline';

class DriveView extends Component {
  constructor(props) {
    super(props);
    this.close = this.close.bind(this);
  }

  close() {
    this.props.dispatch(toDashboard(this.props.dongleId));
  }

  render() {
    const { dongleId, zoom, currentRoute, routeMissing, selectionOutOfRange } = this.props;

    if (!currentRoute) {
      return (
        <div className="DriveView p-8">
          <Typography>{routeMissing ? 'Route does not exist.' : 'Loading...'}</Typography>
        </div>
      );
    }

    if (selectionOutOfRange || !zoom) {
      return (
        <div className="DriveView flex flex-col items-start gap-4 p-8">
          <Typography>This link selects a time after the end of the drive.</Typography>
          <Button
            variant="outlined"
            onClick={ () => this.props.dispatch(toDrive(dongleId, currentRoute.log_id)) }
          >
            View whole drive
          </Button>
        </div>
      );
    }

    // back zooms out of a selection; the whole drive has nothing to zoom out of
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
                onClick={ () => this.props.dispatch(driveBack()) }
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
              <IconButton
                onClick={ filterRegularClick(this.close) }
                aria-label="Close"
                href={ buildUrl(locationFor(deviceBase(VIEWS.DASHBOARD, dongleId))) }
              >
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
  zoom: state.zoom,
  currentRoute: state.currentRoute,
  selectionOutOfRange: selectSelectionOutOfRange(state),
  routeMissing: selectSelectedRouteMissing(state),
});

export default connect(stateToProps)(DriveView);
