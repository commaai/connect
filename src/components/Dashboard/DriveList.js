import React from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles } from '@material-ui/core';

import { checkRoutesData } from '../../actions';
import { useWindowWidth } from '../../hooks/window';
import VisibilityHandler from '../VisibilityHandler';

import DriveListEmpty from './DriveListEmpty';
import DriveListItem from './DriveListItem';

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
  mobile: {
    paddingBottom: 48,
  },
});

const DriveList = (props) => {
  const { dispatch, classes, device, routes } = props;
  const windowWidth = useWindowWidth();

  // Filter out drives shorter than 10 seconds
  const driveList = (routes || [])
    .filter((drive) => drive.end_time_utc_millis - drive.start_time_utc_millis >= 10_000);

  let content;
  if (!driveList.length) {
    content = <DriveListEmpty device={device} routes={routes} />;
  } else {
    content = (
      <div className={`${classes.drives} DriveList`}>
        {driveList.map((drive) => (
          <DriveListItem key={drive.start_time_utc_millis} drive={drive} />
        ))}
      </div>
    );
  }

  return (
    <div className={`${classes.drivesTable} ${windowWidth < 768 && classes.mobile}`}>
      <VisibilityHandler onVisible={() => dispatch(checkRoutesData())} minInterval={60} />
      {content}
    </div>
  );
};

const stateToProps = Obstruction({
  routes: 'routes',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
