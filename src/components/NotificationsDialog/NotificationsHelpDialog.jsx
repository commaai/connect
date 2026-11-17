import React from 'react';
import { Button, Modal, Paper, Typography, withStyles } from '@material-ui/core';

import Colors from '../../colors';
import { InfoOutline, NotificationsIcon, SettingsIcon } from '../../icons';
import { getPlatform } from '../../utils/notifications';

const styles = {
  closeButton: {
    backgroundColor: Colors.grey200,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey400,
    },
  },
};

const stepIconClass = 'h-5 w-5 text-white';

const Toggle = () => (
  <span className="flex h-[16px] w-[26px] items-center justify-end rounded-full bg-[#34c759] px-0.5">
    <span className="h-3 w-3 rounded-full bg-white" />
  </span>
);

const getSteps = (platform, host) => {
  const settings = <SettingsIcon className={stepIconClass} />;
  const bell = <NotificationsIcon className={stepIconClass} />;
  const info = <InfoOutline className={stepIconClass} />;
  const app = <img src="/icon-192x192.png" alt="" className="h-6 w-6 rounded-md" />;
  const toggle = <Toggle />;

  if (platform === 'ios') {
    return [
      [settings, <>Open the <strong>Settings</strong> app</>],
      [bell, <>Tap <strong>Notifications</strong></>],
      [app, <>Scroll down and tap <strong>connect</strong></>],
      [toggle, <>Turn on <strong>Allow Notifications</strong></>],
    ];
  }
  if (platform === 'android') {
    return [
      [app, <>Touch and hold the <strong>connect</strong> icon on your home screen</>],
      [info, <>Tap <strong>App info</strong></>],
      [bell, <>Tap <strong>Notifications</strong></>],
      [toggle, <>Turn notifications <strong>on</strong></>],
    ];
  }
  return [
    [settings, <>Open the app menu and choose <strong>App info</strong> or <strong>Site settings</strong></>],
    [bell, <>Find <strong>Notifications</strong> for {host}</>],
    [toggle, <>Set it to <strong>Allow</strong></>],
  ];
};

const NotificationsHelpDialog = ({ classes, open, onClose }) => {
  if (!open) return null;

  const platform = getPlatform();
  const host = window.location.host;

  return (
    <Modal
      open
      onClose={onClose}
      aria-labelledby="notifications-help-title"
      className="flex items-center justify-center"
    >
      <Paper className="w-[400px] max-w-[90%] p-4 outline-none">
        <div className="mb-[5px]">
          <Typography variant="title" id="notifications-help-title">Notifications are off</Typography>
        </div>
        <hr />
        <div className="mt-3">
          <Typography>
            {platform === 'other'
              ? 'To turn them on for connect:'
              : 'Turn them on for connect in your phone’s settings:'}
          </Typography>
        </div>
        <ol className="mt-3 flex flex-col gap-2">
          {getSteps(platform, host).map(([icon, text], i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#424a4f]">
                {icon}
              </span>
              <Typography component="span">{text}</Typography>
            </li>
          ))}
        </ol>
        {platform === 'android' && (
          <div className="mt-3">
            <Typography variant="caption">
              Still off? In Chrome, go to Settings → Site settings → Notifications and allow {host}.
            </Typography>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <Button variant="contained" className={classes.closeButton} onClick={onClose}>
            Close
          </Button>
        </div>
      </Paper>
    </Modal>
  );
};

export default withStyles(styles)(NotificationsHelpDialog);
