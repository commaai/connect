import React from 'react';
import { Grid, Typography, withStyles } from '@material-ui/core';

import { useWindowWidth } from '../../hooks/window';
import { hasRoutesData } from '../../timeline/segments';

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
    zeroRidesEle = <Typography>Loading...</Typography>;
  } else if (hasRoutesData(props) && routes?.length === 0) {
    zeroRidesEle = (
      <Typography>Looks like you haven&apos;t driven in the selected time range.</Typography>
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
