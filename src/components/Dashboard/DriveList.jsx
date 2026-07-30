import React, { useState, useEffect, useCallback } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import { withStyles, Typography } from '@material-ui/core';
import FilterList from '@material-ui/icons/FilterList';

import { devices as Devices } from '../../api';
import { checkRoutesData, checkLastRoutesData } from '../../actions';
import { isMetric, KM_PER_MI } from '../../utils/conversions';
import {
  shouldShowPreservedRoutesCue,
  shouldHoldPreservedRoutesCue,
  nextPreservedCueHold,
} from '../../utils/preservedRoutesCue';
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
  const {
    dispatch,
    classes,
    device,
    dongleId,
    routes,
    lastRoutes,
    routesMeta,
    limit,
    segmentRange,
    filter,
  } = props;

  const [deviceStats, setDeviceStats] = useState({});
  const [isTimeSelectOpen, setIsTimeSelectOpen] = useState(false);

  const filterKey = `${filter?.start ?? ''}:${filter?.end ?? ''}`;

  const showLive = shouldShowPreservedRoutesCue({
    routes,
    device,
    dongleId,
    routesMeta,
    limit,
    segmentRange,
  });

  const [cueHold, setCueHold] = useState(null);
  useEffect(() => {
    setCueHold((prev) => nextPreservedCueHold({
      prevHold: prev,
      showLive,
      dongleId,
      filterKey,
    }));
  }, [showLive, dongleId, filterKey]);

  const showCue = showLive || shouldHoldPreservedRoutesCue({
    hold: cueHold,
    routes,
    device,
    dongleId,
  });

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
  }, [dongleId, device?.shared]);

  useEffect(() => {
    setDeviceStats({});
    fetchDeviceInfo();
  }, [fetchDeviceInfo]);

  const onVisible = useCallback(() => {
    dispatch(checkRoutesData());
    fetchDeviceInfo();
  }, [dispatch, fetchDeviceInfo]);

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
      <div className="flex gap-2.5 md:gap-8 items-center px-1 justify-center xss:justify-start">
        <div className="flex flex-row items-center gap-1">
          <Typography className="font-semibold text-white">
            { distance }
          </Typography>
          <Typography>
            { metric ? 'kilometers' : 'miles' }
          </Typography>
        </div>
        <div className="flex flex-row items-center gap-1">
          <Typography className="font-semibold text-white">
            { deviceStats.result.all.routes }
          </Typography>
          <Typography>drives</Typography>
        </div>
        <div className="flex flex-row items-center gap-1">
          <Typography className="font-semibold text-white">
            { Math.round(deviceStats.result.all.minutes / 60.0) }
          </Typography>
          <Typography>hours</Typography>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col grow py-2">
      <VisibilityHandler onVisible={onVisible} minInterval={60} />
      <div className="flex flex-row justify-between mx-4 pb-2 gap-2 flex-wrap items-center">
        {renderStats()}
        <button
          className="w-full xxs:w-fit flex flex-row items-center justify-center text-white normal-case py-1 px-2 rounded-md whitespace-nowrap active:scale-[0.98]"
          style={{ background: 'linear-gradient(to bottom, #30373B 0%, #1D2225 150%)' }}
          onClick={() => setIsTimeSelectOpen(true)}
        >
          <FilterList className="mr-2 text-xl" />
          <Typography>Filter</Typography>
        </button>
      </div>
      {showCue && (
        <Typography
          role="status"
          aria-live="polite"
          className="mx-4 px-1 mb-2 text-sm text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis"
        >
          {device?.is_owner === true ? (
            <>
              Preserved routes · free retention ~3 days (see{' '}
              <a href="https://comma.ai/support" target="_blank" rel="noopener noreferrer" className="underline">
                comma.ai/support
              </a>
              )
            </>
          ) : (
            'These are preserved routes.'
          )}
        </Typography>
      )}
      {content}
      {contentStatus}
      <TimeSelect isOpen={isTimeSelectOpen} onClose={() => setIsTimeSelectOpen(false)} />
    </div>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  routes: 'routes',
  lastRoutes: 'lastRoutes',
  device: 'device',
  routesMeta: 'routesMeta',
  limit: 'limit',
  segmentRange: 'segmentRange',
  filter: 'filter',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
