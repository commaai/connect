import React, { useState, useEffect, useCallback } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import { withStyles, Typography } from '@material-ui/core';
import FilterList from '@material-ui/icons/FilterList';

import { devices as Devices } from '@commaai/api';
import { checkRoutesData, checkLastRoutesData } from '../../actions';
import { isMetric, KM_PER_MI } from '../../utils/conversions';
import VisibilityHandler from '../VisibilityHandler';

import TimeSelect from '../TimeSelect';
import DriveListEmpty from './DriveListEmpty';
import DriveListItem from './DriveListItem';
import ScrollIntoView from '../ScrollIntoView'

const styles = () => ({
  header: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
  },
  drives: {
    padding: '0px 16px',
    flex: '1',
  },
  endMessage: {
    padding: 8,
    textAlign: 'center',
    marginBottom: 32,
  },
});

const DriveList = (props) => {
  const { dispatch, classes, device, dongleId, routes, lastRoutes } = props;

  const [deviceStats, setDeviceStats] = useState({});
  const [isTimeSelectOpen, setIsTimeSelectOpen] = useState(false);

  const fetchDeviceInfo = useCallback(async () => {
    if (!dongleId || device?.shared) {
      return;
    }
    setDeviceStats({ fetching: true });
    try {
      const resp = await Devices.fetchDeviceStats(dongleId);
      setDeviceStats({ result: resp });
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'drive_list_device_stats' });
      setDeviceStats({ error: err.message });
    }
  }, [dongleId]);

  useEffect(() => {
    setDeviceStats({});
    fetchDeviceInfo();
  }, [fetchDeviceInfo]);

  let contentStatus;
  let content;
  if (!routes || routes.length === 0) {
    contentStatus = <DriveListEmpty device={device} routes={routes} />;
  } else if (routes && routes.length > 5) {
    contentStatus = (
      <div className={classes.endMessage}>
        <Typography>There are no more routes found in selected time range.</Typography>
      </div>
    );
  }

  // we clean up routes during data fetching, fallback to using lastRoutes to display current data
  const displayRoutes = routes || lastRoutes;
  if (displayRoutes && displayRoutes.length){
    // sort routes by start_time_utc_millis with the latest drive first
    // Workaround upstream sorting issue for now
    // possibly from https://github.com/commaai/connect/issues/451
    displayRoutes.sort((a, b) => b.start_time_utc_millis - a.start_time_utc_millis);
    const routesSize = displayRoutes.length

    content = (
      <div className={`${classes.drives} DriveList`}>
        {displayRoutes.map((drive, index) => {
            // when the last item is in view, we fetch the next routes
            return (index === routesSize - 1 ?
              <ScrollIntoView key={drive.fullname} onInView={() => dispatch(checkLastRoutesData())}>
                <DriveListItem drive={drive} />
              </ScrollIntoView> :
              <DriveListItem key={drive.fullname} drive={drive} />)
        })}
      </div>
    );
  }

  const renderStats = () => {
    if (!deviceStats.result) {
      return <div />;
    }

    const metric = isMetric();
    const distance = metric
      ? Math.round(deviceStats.result.all.distance * KM_PER_MI)
      : Math.round(deviceStats.result.all.distance);

    return (
      <div className="flex gap-4 md:gap-8 items-center px-2">
        <div className="flex flex-row items-center gap-1 max-w-20">
          <Typography variant="caption" className="font-semibold text-white">
            { distance }
          </Typography>
          <Typography variant="caption">
            { metric ? 'kilometers' : 'miles' }
          </Typography>
        </div>
        <div className="flex flex-row items-center gap-1 max-w-20">
          <Typography variant="caption" className="font-semibold text-white">
            { deviceStats.result.all.routes }
          </Typography>
          <Typography variant="caption">drives</Typography>
        </div>
        <div className="flex flex-row items-center gap-1 max-w-20">
          <Typography variant="caption" className="font-semibold text-white">
            { Math.round(deviceStats.result.all.minutes / 60.0) }
          </Typography>
          <Typography variant="caption">hours</Typography>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col grow py-2">
      <VisibilityHandler onVisible={() => dispatch(checkRoutesData())} minInterval={60} />
      <div className="flex flex-row justify-between px-4 pb-1">
        { renderStats() }
        <button
          className="flex flex-row items-center text-white normal-case py-1 px-2 rounded-md whitespace-nowrap hover:bg-white/10"
          onClick={() => setIsTimeSelectOpen(true)}
        >
          <FilterList className="mr-2 text-xl" />
          <Typography variant="caption">Filter</Typography>
        </button>
      </div>
      {content}
      {contentStatus}
      <TimeSelect isOpen={isTimeSelectOpen} onClose={() => setIsTimeSelectOpen(false)} />
    </div>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  routes: 'routes',
  lastRoutes : 'lastRoutes',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
