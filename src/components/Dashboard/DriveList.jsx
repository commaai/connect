import React from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles } from '@material-ui/core';

import { checkRoutesData } from '../../actions';
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
});

const DriveList = (props) => {
  const { dispatch, classes, device, routes } = props;

  let content;
  if (!routes || routes.length === 0) {
    content = <DriveListEmpty device={device} routes={routes} />;
  } else {
    content = (
      <div className={`${classes.drives} DriveList`}>
        {routes.map((drive) => (
          <DriveListItem key={drive.fullname} drive={drive} />
        ))}
      </div>
    );
  }

  return (
    <div className={classes.drivesTable}>
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
