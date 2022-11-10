import { Button, Snackbar, withStyles } from '@material-ui/core';
import React, { useEffect, useState } from 'react';
import Colors from '../../colors';

import { useWindowWidth } from '../../hooks/window';
import { register, unregister } from '../../registerServiceWorker';

const styles = () => ({
  reloadButton: {
    color: Colors.lightBlue900,
    textTransform: 'uppercase',
  },
});

const ServiceWorkerWrapper = (props) => {
  const { classes } = props;
  const [showReload, setShowReload] = useState(true);
  const [waitingWorker, setWaitingWorker] = useState(null);
  const windowWidth = useWindowWidth();

  const onUpdate = (registration) => {
    setWaitingWorker(registration.waiting);
    setShowReload(true);
  };

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_SERVICEWORKER) {
      register({ onUpdate });
    } else {
      unregister();
    }
  });

  const onReload = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    setShowReload(false);
    window.location.reload();
  };

  const action = (
    <Button
      classes={{ root: classes.reloadButton }}
      size="small"
      onClick={onReload}
    >
      Reload
    </Button>
  );

  const position = windowWidth >= 960 ? 'right' : 'center';

  return (
    <Snackbar
      open={showReload}
      message="An update is available. Reload to get the latest version."
      action={action}
      anchorOrigin={{ vertical: 'bottom', horizontal: position }}
    />
  );
};

export default withStyles(styles)(ServiceWorkerWrapper);
