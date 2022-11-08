import React, { useState } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles } from '@material-ui/core';

import DriveListItem from './DriveListItem';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import { checkRoutesData } from '../../actions';

import DriveListEmpty from './DriveListEmpty';

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
});

const DriveList = (props) => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const { dispatch, classes, device, routes } = props;

  const driveList = routes || [];

  return (
    <div className={classes.drivesTable}>
      <ResizeHandler onResize={(width) => setWindowWidth(width)} />
      <VisibilityHandler onVisible={() => dispatch(checkRoutesData())} minInterval={60} />

      { !driveList && (
        <DriveListEmpty
          device={device}
          routes={routes}
          windowWidth={windowWidth}
        />
      ) }

      <div className={`${classes.drives} DriveList`}>
        { driveList.map((drive) => (
          <DriveListItem
            key={drive.start_time_utc_millis}
            drive={drive}
            windowWidth={windowWidth}
          />
        ))}
      </div>
    </div>
  );
};

const stateToProps = Obstruction({
  routes: 'routes',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
