import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ClickAwayListener, Tooltip, withStyles } from '@material-ui/core';

import { InfoOutline } from '../../icons';

const styles = {
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
        borderColor: 'var(--color-surface) transparent transparent transparent',
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
    background: 'var(--color-surface)',
    marginBottom: 8,
  },
  icon: {
    marginLeft: 8,
    fontSize: 18,
  },
};

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
              <p className="text-inherit">{title}</p>
              <span className={classes.arrowArrow} ref={this.handleArrowRef} />
            </>
          )}
          onOpen={this.onTooltipOpen}
          onClose={this.onTooltipClose}
          open={open}
          classes={{ tooltip: classes.tooltip, popper: classes.arrowPopper }}
          placement="top"
        >
          <InfoOutline className={classes.icon} onClick={this.onTooltipOpen} />
        </Tooltip>
      </ClickAwayListener>
    );
  }
}

InfoTooltip.propTypes = {
  title: PropTypes.string.isRequired,
};

export default withStyles(styles)(InfoTooltip);
