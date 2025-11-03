import { ClickAwayListener, Tooltip, Typography, withStyles } from '@material-ui/core';
import { useState } from 'react';

import { InfoOutline } from '../../icons';

const styles = (theme) => ({
  arrowPopper: {
    opacity: 1,
    '& $arrowArrow': {
      bottom: 0,
      left: 0,
      marginBottom: '-0.9em',
      width: '3em',
      height: '1em',
      '&::before': {
        borderWidth: '1em 1em 0 1em',
        borderColor: `${theme.palette.grey[900]} transparent transparent transparent`,
      },
    },
  },
  arrowArrow: {
    position: 'absolute',
    fontSize: 7,
    width: '3em',
    height: '3em',
    '&::before': {
      content: '""',
      margin: 'auto',
      display: 'block',
      width: 0,
      height: 0,
      borderStyle: 'solid',
    },
  },
  tooltip: {
    background: theme.palette.grey[900],
    marginBottom: 8,
  },
  icon: {
    marginLeft: theme.spacing.unit,
    fontSize: 18,
  },
});

const InfoTooltip = ({ classes, title }) => {
  const [arrowRef, setArrowRef] = useState(null);
  const [open, setOpen] = useState(false);

  const handleArrowRef = (node) => {
    setArrowRef(node);
  };

  const onTooltipOpen = () => {
    setOpen(true);
  };

  const onTooltipClose = () => {
    setOpen(false);
  };

  return (
    <ClickAwayListener onClickAway={onTooltipClose}>
      <Tooltip
        PopperProps={{
          popperOptions: {
            modifiers: {
              arrow: {
                enabled: Boolean(arrowRef),
                element: arrowRef,
              },
            },
          },
        }}
        title={
          <>
            <Typography color="inherit">{title}</Typography>
            <span className={classes.arrowArrow} ref={handleArrowRef} />
          </>
        }
        onOpen={onTooltipOpen}
        onClose={onTooltipClose}
        open={open}
        classes={{ tooltip: classes.tooltip, popper: classes.arrowPopper }}
        placement="top"
      >
        <InfoOutline className={classes.icon} onClick={onTooltipOpen} />
      </Tooltip>
    </ClickAwayListener>
  );
};

export default withStyles(styles)(InfoTooltip);
