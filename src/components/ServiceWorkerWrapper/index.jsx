import { Button, CircularProgress, Snackbar, withStyles } from '@material-ui/core';
import React, { useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';

import { register, unregister } from '../../serviceWorkerRegistration';

const styles = () => ({
  button: {
    textTransform: 'uppercase',
  },
});

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
    console.log('[ServiceWorkerWrapper] Update is available');
    setWaitingWorker(registration.waiting);
    setShowUpdate(true);
  };

  const onSWSuccess = () => {
    console.log('[ServiceWorkerWrapper] Update successful');
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (import.meta.env.PROD && import.meta.env.VITE_APP_SERVICEWORKER) {
      console.log('[ServiceWorkerWrapper] Registering service worker...');
      register({
        // show update found message
        onUpdate: onSWUpdate,

        // TODO: show "connect now works offline" message
        onSuccess: onSWSuccess,
      });
    } else {
      console.log('[ServiceWorkerWrapper] Unregistering service worker...');
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
