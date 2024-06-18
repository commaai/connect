import React from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, Typography } from '@material-ui/core';

import { checkRoutesData, checkLastRoutesData } from '../../actions';
import VisibilityHandler from '../VisibilityHandler';

import DriveListEmpty from './DriveListEmpty';
import DriveListItem from './DriveListItem';
import ScrollIntoView from '../ScrollIntoView'

const styles = () => ({
  drivesTable: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  },
  drives: {
    padding: 16,
    flex: '1',
  },
  endMessage: {
    padding: 8,
    textAlign: 'center',
    marginBottom: 32,
  },
});

const DriveList = (props) => {
  const { dispatch, classes, device, routes, lastRoutes } = props;
  let contentStatus;
  let content;
  if (!routes || routes.length === 0) {
    contentStatus = <DriveListEmpty device={device} routes={routes} />;
  } else if (routes && routes.length > 5) {
    contentStatus = (
      <div className={classes.endMessage}>
        <Typography>There are no more routes found in selected time range.</Typography>
      </div>
    );
  }

  // we clean up routes during data fetching, fallback to using lastRoutes to display current data
  const displayRoutes = routes || lastRoutes;
  if (displayRoutes && displayRoutes.length){
    // sort routes by start_time_utc_millis with the latest drive first
    // Workaround upstream sorting issue for now
    // possibly from https://github.com/commaai/connect/issues/451
    displayRoutes.sort((a, b) => b.start_time_utc_millis - a.start_time_utc_millis);
    const routesSize = displayRoutes.length

    content = (
      <div className={`${classes.drives} DriveList`}>
        {displayRoutes.map((drive, index) => {
            // when the last item is in view, we fetch the next routes
            return (index === routesSize - 1 ?
              <ScrollIntoView key={drive.fullname} onInView={() => dispatch(checkLastRoutesData())}>
                <DriveListItem drive={drive} />
              </ScrollIntoView> :
              <DriveListItem key={drive.fullname} drive={drive} />)
        })}
      </div>
    );
  }

  return (
    <div className={classes.drivesTable}>
      <VisibilityHandler onVisible={() => dispatch(checkRoutesData())} minInterval={60} />
      {content}
      {contentStatus}
    </div>
  );
};

const stateToProps = Obstruction({
  routes: 'routes',
  lastRoutes : 'lastRoutes',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
