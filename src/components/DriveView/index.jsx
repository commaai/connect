import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { IconButton, Typography } from '@material-ui/core';

import { popTimelineRange, pushTimelineRange } from '../../actions';
import { fetchLocations } from '../../actions/cached';
import { ArrowBackBold } from '../../icons';
import { formatDriveDuration } from '../../utils';
import { isMetric, KM_PER_MI } from '../../utils/conversions';

import Media from './Media';

class DriveView extends Component {
  constructor(props) {
    super(props);
    this.onBack = this.onBack.bind(this);
    this.renderHeader = this.renderHeader.bind(this);
  }

  componentDidMount() {
    this.loadLocations();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      this.loadLocations();
    }
  }

  // back goes up one level: zoomed range -> previous range or whole drive -> the device's drive list
  onBack() {
    const { dispatch, zoom, currentRoute } = this.props;
    if (zoom.start === 0 && zoom.end === currentRoute.duration) {
      dispatch(pushTimelineRange(null, null, null));
    } else if (zoom.previous) {
      dispatch(popTimelineRange(currentRoute.log_id));
    } else {
      dispatch(pushTimelineRange(currentRoute.log_id, null, null));
    }
  }

  loadLocations() {
    const { dispatch, currentRoute } = this.props;
    if (currentRoute && !currentRoute.startLocation) {
      dispatch(fetchLocations(currentRoute));
    }
  }

  renderHeader(actions) {
    const { zoom, currentRoute } = this.props;

    // FIXME: end time not always same day as start time
    const start = currentRoute.start_time_utc_millis + zoom.start;
    const startDateObj = dayjs(start);
    const day = startDateObj.format(`ddd, MMM D${dayjs().year() === startDateObj.year() ? '' : ', YYYY'}`);
    const endTime = dayjs(start + (zoom.end - zoom.start)).format('HH:mm');

    const wholeDrive = zoom.start === 0 && zoom.end === currentRoute.duration;
    const from = currentRoute.startLocation?.place;
    const to = currentRoute.endLocation?.place;
    const facts = [
      wholeDrive && currentRoute.distance != null && (isMetric()
        ? `${+(currentRoute.distance * KM_PER_MI).toFixed(1)} km`
        : `${+currentRoute.distance.toFixed(1)} mi`),
      wholeDrive && from && to && (from === to ? from : `${from} → ${to}`),
      formatDriveDuration(zoom.end - zoom.start),
    ].filter(Boolean).join(' · ');

    return (
      <div className="flex items-center gap-2">
        <IconButton
          className="-ml-2 text-[1.5em] w-[2em] h-[2em]"
          onClick={this.onBack}
          aria-label="Go Back"
        >
          <ArrowBackBold fontSize="inherit" />
        </IconButton>
        <div className="min-w-0 flex-1 text-white">
          {currentRoute.demo_title ? (
            <div className="mb-0.5 w-fit max-w-full truncate rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
              {currentRoute.demo_title}
            </div>
          ) : null}
          <div className="truncate text-lg font-medium">{`${day} · ${startDateObj.format('HH:mm')}–${endTime}`}</div>
          <div className="line-clamp-2 break-words text-sm text-white/50 md:line-clamp-1" title={facts}>{facts}</div>
        </div>
        {actions}
      </div>
    );
  }

  render() {
    const { zoom, currentRoute, routes } = this.props;

    if (!currentRoute) {
      return (
        <div className="DriveView p-8">
          <Typography>{routes === null ? 'Loading...' : 'Route does not exist.'}</Typography>
        </div>
      );
    }

    return (
      <div className="DriveView text-[length:min(1rem,3.846vw)] [--spacing:calc(min(1rem,3.846vw)/4)] [--text-xs:0.75em] [--text-lg:1.125em]">
        <div className="px-4 pb-4 pt-5 md:px-8 md:pt-6">
          {(routes && routes.length === 0)
            ? <Typography>Route does not exist.</Typography>
            : <Media renderHeader={zoom ? this.renderHeader : undefined} />}
        </div>
      </div>
    );
  }
}

const stateToProps = (state) => ({
  routes: state.routes,
  zoom: state.zoom,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveView);
