import React from 'react';
import { Grid, withStyles } from '@material-ui/core';

import { useWindowWidth } from '../../hooks/window';

const styles = () => ({
  zeroState: {
    flex: '0',
  },
});

const DriveListEmpty = (props) => {
  const windowWidth = useWindowWidth();
  const { classes, device, routes } = props;
  let zeroRidesEle = null;

  if (device && routes === null) {
    zeroRidesEle = <p>Loading...</p>;
  } else if (routes?.length === 0) {
    zeroRidesEle = (
      <p>No routes found in selected time range.</p>
    );
  }

  const containerPadding = windowWidth > 520 ? 36 : 16;
  return (
    <Grid container className={classes.zeroState} style={{ padding: `16px ${containerPadding}px` }}>
      {zeroRidesEle}
    </Grid>
  );
};

export default withStyles(styles)(DriveListEmpty);
