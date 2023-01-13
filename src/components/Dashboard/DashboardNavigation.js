import React from 'react';
import { connect } from 'react-redux';

import BottomNavigation from '@material-ui/core/BottomNavigation';
import BottomNavigationAction from '@material-ui/core/BottomNavigationAction';
import { withStyles } from '@material-ui/core/styles';

import MapIcon from '@material-ui/icons/Map';
import TimelineIcon from '@material-ui/icons/Timeline';
import VideoLibraryIcon from '@material-ui/icons/VideoLibrary';

import { fetchClipsList } from '../../actions/clips';
import Obstruction from 'obstruction'

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

const DashboardNavigation = ({ classes, dispatch, dongleId, page, setPage }) => {
  const onChange = (event, value) => {
    if (value === 2) {
      dispatch(fetchClipsList(dongleId));
    }

    setPage(value);
  };

  return (
    <BottomNavigation
      className={classes.root}
      value={page}
      onChange={onChange}
      showLabels
    >
      <BottomNavigationAction label="Map" icon={<MapIcon />} />
      <BottomNavigationAction label="Timeline" icon={<TimelineIcon />} />
      <BottomNavigationAction label="Clips" icon={<VideoLibraryIcon />} />
    </BottomNavigation>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  clips: 'clips',
});

export default connect(stateToProps)(withStyles(styles)(DashboardNavigation));
