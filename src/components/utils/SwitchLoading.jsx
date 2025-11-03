import { FormControlLabel, Popper, Switch, Typography, withStyles } from '@material-ui/core';
import { useState } from 'react';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import InfoTooltip from './InfoTooltip';

const styles = () => ({
  root: {
    display: 'flex',
    alignItems: 'center',
  },
  switchThumbLoading: {
    '&::before': {
      content: "''",
      display: 'inline-block',
      height: '100%',
      width: '100%',
      backgroundImage:
        "url('data:image/svg+xml;utf8," +
        '<svg xmlns="http://www.w3.org/2000/svg" height="20" width="20" viewBox="0 0 20 20">' +
        '<circle cx="50%25" cy="50%25" r="5" stroke="%23eee" fill="none" stroke-width="2" ' +
        'stroke-dasharray="24px 8px"></circle></svg>\')',
      strokeDasharray: '80px, 200px',
      animation: 'circular-rotate 1s linear infinite',
    },
  },
  errorIcon: {
    color: Colors.red300,
  },
  copiedPopover: {
    borderRadius: 16,
    padding: '8px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    marginTop: 12,
    zIndex: 50000,
    maxWidth: '95%',
    '& p': {
      maxWidth: 400,
      fontSize: '0.9rem',
      color: Colors.white,
      margin: 0,
    },
  },
});

const SwitchLoading = ({ classes, checked, label, loading, tooltip, onChange: propsOnChange }) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalChecked, setInternalChecked] = useState(null);
  const [error, setError] = useState(null);
  const [errorPopper, setErrorPopper] = useState(null);

  const onChange = async (ev) => {
    if (internalLoading) {
      return;
    }

    setInternalLoading(true);
    setInternalChecked(ev.target.checked);
    setError(null);

    const res = await propsOnChange(ev);
    if (res?.error) {
      setInternalLoading(false);
      setInternalChecked(null);
      setError(res.error);
      return;
    }

    setInternalLoading(false);
    setInternalChecked(null);
    setError(null);
  };

  const isChecked = internalChecked !== null ? internalChecked : checked;
  const loadingCls = loading || internalLoading ? { icon: classes.switchThumbLoading } : {};

  const switchEl = <Switch color="secondary" checked={isChecked} onChange={onChange} classes={loadingCls} disabled={loading} />;

  return (
    <div className={classes.root}>
      <FormControlLabel control={switchEl} label={label} />
      {tooltip && <InfoTooltip title={tooltip} />}
      {Boolean(error) && (
        <>
          <ErrorOutline className={classes.errorIcon} onMouseLeave={() => setErrorPopper(null)} onMouseEnter={(ev) => setErrorPopper(ev.target)} />
          <Popper open={Boolean(errorPopper)} placement="bottom" anchorEl={errorPopper} className={classes.copiedPopover}>
            <Typography>{error}</Typography>
          </Popper>
        </>
      )}
    </div>
  );
};

export default withStyles(styles)(SwitchLoading);
