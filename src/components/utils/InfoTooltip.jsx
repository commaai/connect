import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ClickAwayListener, Tooltip, Typography, withStyles } from '@material-ui/core';
import InfoIcon from '@material-ui/icons/InfoOutline';

const styles = (theme) => ({
  arrowPopper: {
    opacity: 1,
    '&[x-placement*="bottom"] $arrowArrow': {
      top: 0,
      left: 0,
      marginTop: '-0.9em',
      width: '3em',
      height: '1em',
      '&::before': {
        borderWidth: '0 1em 1em 1em',
        borderColor: `transparent transparent ${theme.palette.grey[900]} transparent`,
      },
    },
    '&[x-placement*="top"] $arrowArrow': {
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
    '&[x-placement*="right"] $arrowArrow': {
      left: 0,
      marginLeft: '-0.9em',
      height: '3em',
      width: '1em',
      '&::before': {
        borderWidth: '1em 1em 1em 0',
        borderColor: `transparent ${theme.palette.grey[900]} transparent transparent`,
      },
    },
    '&[x-placement*="left"] $arrowArrow': {
      right: 0,
      marginRight: '-0.9em',
      height: '3em',
      width: '1em',
      '&::before': {
        borderWidth: '1em 0 1em 1em',
        borderColor: `transparent transparent transparent ${theme.palette.grey[900]}`,
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

class InfoTooltip extends Component {
  constructor(props) {
    super(props);

    this.state = {
      arrowRef: null,
      open: false,
    };

    this.handleArrowRef = this.handleArrowRef.bind(this);
    this.onTooltipOpen = this.onTooltipOpen.bind(this);
    this.onTooltipClose = this.onTooltipClose.bind(this);
  }

  handleArrowRef(node) {
    this.setState({
      arrowRef: node,
    });
  }

  onTooltipOpen() {
    this.setState({ open: true });
  }

  onTooltipClose() {
    this.setState({ open: false });
  }

  render() {
    const {
      classes,
      title,
      placement = 'top',
    } = this.props;
    const { arrowRef, open } = this.state;

    return (
      <ClickAwayListener onClickAway={this.onTooltipClose}>
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
          title={(
            <>
              <Typography color="inherit">{title}</Typography>
              <span className={classes.arrowArrow} ref={this.handleArrowRef} />
            </>
          )}
          onOpen={this.onTooltipOpen}
          onClose={this.onTooltipClose}
          open={open}
          classes={{ tooltip: classes.tooltip, popper: classes.arrowPopper }}
          placement={placement}
        >
          <InfoIcon className={classes.icon} onClick={this.onTooltipOpen} />
        </Tooltip>
      </ClickAwayListener>
    );
  }
}

InfoTooltip.propTypes = {
  title: PropTypes.string.isRequired,
  placement: PropTypes.string,
};

export default withStyles(styles)(InfoTooltip);
