import { Grid, Typography, withStyles } from '@material-ui/core';

import { useWindowWidth } from '../../hooks/window';
import Spinner from '../utils/Spinner';

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
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
        <Spinner label="Loading drives" />
        <Typography>Loading drives...</Typography>
      </div>
    );
  }
  if (routes?.length === 0) {
    zeroRidesEle = (
      <Typography>No routes found in selected time range.</Typography>
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
