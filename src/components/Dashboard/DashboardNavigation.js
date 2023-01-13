import React from 'react';

import BottomNavigation from '@material-ui/core/BottomNavigation';
import BottomNavigationAction from '@material-ui/core/BottomNavigationAction';
import { withStyles } from '@material-ui/core/styles';

import DirectionsCarIcon from '@material-ui/icons/DirectionsCar';
import MapIcon from '@material-ui/icons/Map';

const styles = () => ({
  root: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    padding: 'env(safe-area-inset-bottom) 0 env(safe-area-inset-bottom) 0',
    height: 'calc(56px + env(safe-area-inset-bottom))',
  },
});

const DashboardNavigation = ({ classes, page, setPage }) => {
  const onChange = (event, value) => {
    setPage(value);
  };

  return (
    <BottomNavigation
      className={classes.root}
      value={page}
      onChange={onChange}
      showLabels
    >
      <BottomNavigationAction label="Navigation" icon={<MapIcon />} />
      <BottomNavigationAction label="Drives" icon={<DirectionsCarIcon />} />
    </BottomNavigation>
  );
};

export default withStyles(styles)(DashboardNavigation);
