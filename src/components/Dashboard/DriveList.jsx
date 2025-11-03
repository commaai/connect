import { Box, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';

import { checkLastRoutesData, checkRoutesData } from '../../actions';
import ScrollIntoView from '../ScrollIntoView';
import VisibilityHandler from '../VisibilityHandler';
import DriveListEmpty from './DriveListEmpty';
import DriveListItem from './DriveListItem';

const DriveList = () => {
  const dispatch = useDispatch();
  const device = useSelector((state) => state.device);
  const routes = useSelector((state) => state.routes);
  const lastRoutes = useSelector((state) => state.lastRoutes);
  let contentStatus;
  let content;
  if (!routes || routes.length === 0) {
    contentStatus = <DriveListEmpty device={device} routes={routes} />;
  } else if (routes && routes.length > 5) {
    contentStatus = (
      <Box sx={{ padding: 1, textAlign: 'center', mb: 4 }}>
        <Typography>There are no more routes found in selected time range.</Typography>
      </Box>
    );
  }

  // we clean up routes during data fetching, fallback to using lastRoutes to display current data
  const displayRoutes = routes || lastRoutes;
  if (displayRoutes && displayRoutes.length) {
    // sort routes by start_time_utc_millis with the latest drive first
    // Workaround upstream sorting issue for now
    // possibly from https://github.com/commaai/connect/issues/451
    displayRoutes.sort((a, b) => b.start_time_utc_millis - a.start_time_utc_millis);
    const routesSize = displayRoutes.length;

    content = (
      <Box className="DriveList" sx={{ padding: 2, flex: '1' }}>
        {displayRoutes.map((drive, index) => {
          // when the last item is in view, we fetch the next routes
          return index === routesSize - 1 ? (
            <ScrollIntoView key={drive.fullname} onInView={() => dispatch(checkLastRoutesData())}>
              <DriveListItem drive={drive} />
            </ScrollIntoView>
          ) : (
            <DriveListItem key={drive.fullname} drive={drive} />
          );
        })}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <VisibilityHandler onVisible={() => dispatch(checkRoutesData())} minInterval={60} />
      {content}
      {contentStatus}
    </Box>
  );
};

export default DriveList;
