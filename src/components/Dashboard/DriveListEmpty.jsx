import { Grid, Typography, withStyles } from '@material-ui/core';

import { useWindowWidth } from '../../hooks/window';

const styles = () => ({
  zeroState: {
    flex: '0',
  },
});

const DriveListEmpty = ({ classes }) => {
  const windowWidth = useWindowWidth();
  const containerPadding = windowWidth > 520 ? 36 : 16;

  return (
    <Grid container className={classes.zeroState} style={{ padding: `16px ${containerPadding}px` }}>
      <Typography>No routes found in selected time range.</Typography>
    </Grid>
  );
};

export default withStyles(styles)(DriveListEmpty);
