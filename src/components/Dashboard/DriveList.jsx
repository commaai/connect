import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';
import { withStyles, Typography } from '@material-ui/core';
import FilterList from '@material-ui/icons/FilterList';

import { devices as Devices } from '../../api';
import { checkRoutesData, checkLastRoutesData } from '../../actions';
import { isMetric, KM_PER_MI } from '../../utils/conversions';
import VisibilityHandler from '../VisibilityHandler';

import TimeSelect from '../TimeSelect';
import Loading from '../Loading';
import DriveListEmpty from './DriveListEmpty';
import DriveListItem from './DriveListItem';
import ScrollIntoView from '../ScrollIntoView';

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
  loading: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 36px',
  },
});

const DriveList = (props) => {
  const { dispatch, classes, device, dongleId, routes } = props;

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
  }, [dongleId, device?.shared]);

  useEffect(() => {
    setDeviceStats({});
    fetchDeviceInfo();
  }, [fetchDeviceInfo]);

  const onVisible = useCallback(() => {
    dispatch(checkRoutesData());
    fetchDeviceInfo();
  }, [dispatch, fetchDeviceInfo]);

  let contentStatus = null;
  if (routes == null) {
    contentStatus = (
      <div className={classes.loading} aria-live="polite">
        <Loading className="mr-2.5 shrink-0" label="Loading drives" />
        <Typography>Loading drives...</Typography>
      </div>
    );
  } else if (routes.length === 0) {
    contentStatus = <DriveListEmpty />;
  }

  // Work around upstream sorting issue: https://github.com/commaai/connect/issues/451
  const displayRoutes = useMemo(() => routes?.slice().sort(
    (a, b) => b.start_time_utc_millis - a.start_time_utc_millis,
  ), [routes]);

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
      <div className="flex flex-row justify-between mx-4 pb-2 gap-2 flex-wrap">
        { renderStats() }
        <button
          className="w-full xxs:w-fit flex flex-row items-center justify-center text-white normal-case py-1 px-2 rounded-md whitespace-nowrap active:scale-[0.98] cursor-pointer"
          style={{ background: 'linear-gradient(to bottom, #30373B 0%, #1D2225 150%)' }}
          onClick={() => setIsTimeSelectOpen(true)}
        >
          <FilterList className="mr-2 text-xl" />
          <Typography>Filter</Typography>
        </button>
      </div>
      {contentStatus}
      {displayRoutes?.length > 0 && (
        <div className={`${classes.drives} DriveList`}>
          {displayRoutes.map((drive, index) => (
            index === displayRoutes.length - 1 ? (
              <ScrollIntoView key={drive.fullname} onInView={() => dispatch(checkLastRoutesData())}>
                <DriveListItem drive={drive} />
              </ScrollIntoView>
            ) : <DriveListItem key={drive.fullname} drive={drive} />
          ))}
        </div>
      )}
      {routes?.length > 5 && (
        <div className={classes.endMessage}>
          <Typography>There are no more routes found in selected time range.</Typography>
        </div>
      )}
      <TimeSelect isOpen={isTimeSelectOpen} onClose={() => setIsTimeSelectOpen(false)} />
    </div>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  routes: state.routes,
  device: state.device,
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
