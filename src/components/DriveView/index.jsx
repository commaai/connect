import { IconButton, Typography } from '@material-ui/core';
import dayjs from 'dayjs';
import { Component } from 'react';
import { connect } from 'react-redux';
import { ArrowBackBold, CloseBold } from '../../icons';
import { navigate } from '../../navigation';
import { selectCurrentRoute, selectRouteZoom } from '../../selectors/route';
import Timeline from '../Timeline';
import Media from './Media';

class DriveView extends Component {
  constructor(props) {
    super(props);
    this.close = this.close.bind(this);
  }

  onBack(zoom, currentRoute) {
    if (currentRoute) {
      navigate(`/${this.props.dongleId}/${currentRoute.log_id}`);
    }
  }

  close() {
    navigate(`/${this.props.dongleId}`);
  }

  render() {
    const { zoom, currentRoute, routes } = this.props;

    const currentRouteBoundsSelected = zoom.start === 0 && zoom.end === currentRoute?.duration;
    const backButtonDisabled = currentRouteBoundsSelected;

    // FIXME: end time not always same day as start time
    const start = currentRoute.start_time_utc_millis + zoom.start;
    const startDateObj = dayjs(start);
    const startDay = startDateObj.format('dddd');
    const startTime = startDateObj.format(`MMM D${dayjs().year() === startDateObj.year() ? '' : ', YYYY'} @ HH:mm`);
    const endTime = dayjs(start + (zoom.end - zoom.start)).format('HH:mm');

    return (
      <div className="DriveView">
        <div className="flex flex-col rounded-lg m-4 bg-[linear-gradient(to_bottom,#30373B_0%,#272D30_10%,#1D2225_100%)]">
          <div>
            <div className="items-center justify-between flex p-3 gap-2">
              <IconButton onClick={() => this.onBack(zoom, currentRoute)} aria-label="Go Back" disabled={backButtonDisabled}>
                <ArrowBackBold />
              </IconButton>
              <div className="text-white text-lg font-medium">
                <span className="hidden sm:inline">{`${startDay} `}</span>
                {`${startTime} - ${endTime}`}
              </div>
              <IconButton onClick={this.close} aria-label="Close">
                <CloseBold />
              </IconButton>
            </div>
            <Timeline route={currentRoute} thumbnailsVisible hasRuler />
          </div>
          <div className="p-3 md:p-8">{routes && routes.length === 0 ? <Typography>Route does not exist.</Typography> : <Media />}</div>
        </div>
      </div>
    );
  }
}

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  routes: state.routes,
  zoom: selectRouteZoom(state),
  currentRoute: selectCurrentRoute(state),
});

export default connect(stateToProps)(DriveView);
