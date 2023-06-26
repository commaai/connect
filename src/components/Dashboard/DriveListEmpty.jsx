import { Grid, Typography } from '@material-ui/core';

import { hasRoutesData } from '../../timeline/segments';

const DriveListEmpty = (props) => {
  const { device, routes } = props;
  let zeroRidesEle = null;

  if (device && routes === null) {
    zeroRidesEle = <Typography>Loading...</Typography>;
  } else if (hasRoutesData(props) && routes?.length === 0) {
    zeroRidesEle = (
      <Typography>Looks like you haven&apos;t driven in the selected time range.</Typography>
    );
  }

  return (
    <Grid container className="flex-grow-0 px-4 py-4 sm:py-9">
      {zeroRidesEle}
    </Grid>
  );
};

export default DriveListEmpty;
