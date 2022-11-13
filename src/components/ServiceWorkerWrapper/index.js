import { Button, CircularProgress, Snackbar, withStyles } from '@material-ui/core';
import React, { useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';

import { register, unregister } from '../../serviceWorkerRegistration';

const styles = () => ({
  button: {
    textTransform: 'uppercase',
  },
});

const SERVICE_WORKER_ATTEMPTS = 'connect.serviceWorker.installAttempts';

const getAttempts = () => {
  if (!window.localStorage) return 0;
  return window.localStorage.getItem(SERVICE_WORKER_ATTEMPTS) || 0;
};

const incrementAttempts = () => {
  if (!window.localStorage) return;
  const retries = getAttempts();
  window.localStorage.setItem(SERVICE_WORKER_ATTEMPTS, retries + 1);
};

const resetAttempts = () => {
  if (!window.localStorage) return;
  window.localStorage.setItem(SERVICE_WORKER_ATTEMPTS, 0);
};

const ServiceWorkerWrapper = (props) => {
  const { classes } = props;

  const [showUpdate, setShowUpdate] = useState(false);
  const [loading, setLoading] = useState(false);

  const [waitingWorker, setWaitingWorker] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const onSWUpdate = (registration) => {
    if (!registration.waiting) {
      Sentry.captureMessage('[ServiceWorkerWrapper] Update is available but there is no waiting service worker to install', 'warning');
      return;
    }
    if (getAttempts() > 3) {
      Sentry.captureMessage('[ServiceWorkerWrapper] Update is available but we have tried to install it too many times', 'error');
      navigation.serviceWorker.getRegistration().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      if (refreshing) return;
      setRefreshing(true);
      window.location.reload();
      return;
    }
    console.log('[ServiceWorkerWrapper] Update is available');
    setWaitingWorker(registration.waiting);
    setShowUpdate(true);
  };

  const onSWSuccess = () => {
    console.log('[ServiceWorkerWrapper] Update successful');
    resetAttempts();
  };

  const onSWChange = () => {
    console.log('[ServiceWorkerWrapper] Controller changed');
    if (refreshing) return;
    setRefreshing(true);
    window.location.reload();
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_SERVICEWORKER) {
      navigator.serviceWorker.addEventListener('controllerchange', onSWChange);

      console.log('[ServiceWorkerWrapper] Registering service worker...');
      register({
        // show update found message
        onUpdate: onSWUpdate,

        // TODO: show "connect now works offline" message
        onSuccess: onSWSuccess,
      });
    } else {
      unregister();
    }
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const onReload = () => {
    if (!waitingWorker) {
      Sentry.captureMessage('[ServiceWorkerWrapper] No waiting worker found', 'error');
      setShowUpdate(false);
      return;
    }
    setLoading(true);
    incrementAttempts();
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => {
      Sentry.captureMessage('[ServiceWorkerWrapper] Timed out waiting for controller change', 'error');
      if (refreshing) return;
      setRefreshing(true);
      window.location.reload();
    }, 60_000);
  };

  const onDismiss = () => {
    setShowUpdate(false);
  };

  const action = (
    <>
      <Button
        classes={{ root: classes.button }}
        color="primary"
        size="small"
        disabled={loading}
        onClick={onReload}
      >
        {loading ? <CircularProgress color="primary" size={20} /> : 'Reload'}
      </Button>
      <Button
        classes={{ root: classes.button }}
        color="primary"
        size="small"
        disabled={loading}
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </>
  );

  return (
    <Snackbar
      open={showUpdate}
      message="An update is ready. Reload to get the latest version."
      action={action}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    />
  );
};

export default withStyles(styles)(ServiceWorkerWrapper);
