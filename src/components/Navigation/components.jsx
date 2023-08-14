import React, { forwardRef } from 'react';

import { Button, withStyles } from '@material-ui/core';
import { Clear } from '@material-ui/icons';

import Colors from '../../colors';

export const SearchSelectBox = withStyles({
  searchSelectBox: {
    borderRadius: 22,
    padding: '12px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    color: Colors.white,
    display: 'flex',
    flexDirection: 'column',
  },
  searchSelectBoxHeader: {
    display: 'flex',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  searchSelectBoxTitle: {
    flexBasis: 'auto',
  },
  searchSelectBoxButtons: {
    display: 'flex',
    flexWrap: 'wrap-reverse',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  clearSearchSelect: {
    padding: 5,
    fontSize: 20,
    cursor: 'pointer',
    position: 'absolute',
    left: -6,
    top: -8,
    height: 24,
    width: 24,
    borderRadius: 12,
    backgroundColor: Colors.grey900,
    color: Colors.white,
    border: `1px solid ${Colors.grey600}`,
    '&:hover': {
      backgroundColor: Colors.grey700,
    },
  },
})(forwardRef(({ classes, className, title, children, footer, onClear }, ref) => (
  <div className={`${classes.searchSelectBox} ${className || ''}`} ref={ref}>
    {onClear && <Clear className={classes.clearSearchSelect} onClick={onClear} />}
    <div className={classes.searchSelectBoxHeader}>
      <div className={classes.searchSelectBoxTitle}>{title}</div>
      {children && (
        <div className={classes.searchSelectBoxButtons}>
          {children}
        </div>
      )}
    </div>
    {footer}
  </div>
)));

export const SearchSelectButton = withStyles({
  searchSelectButton: {
    marginLeft: 8,
    padding: '6px 12px',
    backgroundColor: Colors.white,
    borderRadius: 15,
    color: Colors.grey900,
    textTransform: 'none',
    minHeight: 'unset',
    flexGrow: 1,
    maxWidth: 125,
    '&:hover': {
      background: '#ddd',
      color: Colors.grey900,
    },
    '&:disabled': {
      background: '#ddd',
      color: Colors.grey900,
    },
  },
  searchSelectButtonSecondary: {
    marginLeft: 8,
    padding: '4.5px 12px',
    borderRadius: 15,
    textTransform: 'none',
    minHeight: 'unset',
    flexGrow: 1,
    maxWidth: 125,
    border: `1.5px solid ${Colors.white50}`,
    '&:disabled': {
      border: `1.5px solid ${Colors.white20}`,
    },
  },
})(({
  children,
  classes,
  secondary,
  disabled,
  onClick,
  href,
  style,
}) => (
  <Button
    classes={{
      root: secondary ? classes.searchSelectButtonSecondary : classes.searchSelectButton,
      label: 'whitespace-nowrap',
    }}
    disabled={disabled}
    onClick={onClick}
    href={href}
    target={href ? '_blank' : undefined}
    style={style}
  >
    {children}
  </Button>
));

export const SearchSelectFakeButton = withStyles({
  searchSelectButton: {
    marginLeft: 8,
    padding: '6px 12px',
    backgroundColor: Colors.white,
    borderRadius: 15,
    color: Colors.grey900,
    textTransform: 'none',
    minHeight: 'unset',
    flexGrow: 1,
    maxWidth: 125,
    '&:hover': {
      background: '#ddd',
      color: Colors.grey900,
    },
    '&:disabled': {
      background: '#ddd',
      color: Colors.grey900,
    },
  },
  searchSelectButtonFake: {
    background: '#ddd',
    minWidth: 81.4,
    textAlign: 'center',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    '& p': {
      color: Colors.grey900,
      lineHeight: '1.4em',
      fontWeight: 500,
    },
  },
})(forwardRef(({
  children,
  classes,
}, ref) => (
  <div
    ref={ref}
    className={`${classes.searchSelectButton} ${classes.searchSelectButtonFake}`}
  >
    {children}
  </div>
)));
