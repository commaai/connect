import { Grid, Typography } from '@mui/material';

import { useWindowWidth } from '../../hooks/window';

const DriveListEmpty = (props) => {
  const windowWidth = useWindowWidth();
  const { device, routes } = props;
  let zeroRidesEle = null;

  if (device && routes === null) {
    zeroRidesEle = <Typography>Loading...</Typography>;
  } else if (routes?.length === 0) {
    zeroRidesEle = <Typography>No routes found in selected time range.</Typography>;
  }

  const containerPadding = windowWidth > 520 ? 36 : 16;
  return (
    <Grid container sx={{ flex: '0', padding: `16px ${containerPadding}px` }}>
      {zeroRidesEle}
    </Grid>
  );
};

export default DriveListEmpty;
