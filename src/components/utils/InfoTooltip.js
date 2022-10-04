import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Tooltip, Typography, withStyles } from '@material-ui/core';
import InfoIcon from '@material-ui/icons/InfoOutline';

const styles = (theme) => ({
  arrowPopper: {
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
    fontSize: 18,
  },
});

class InfoTooltip extends Component {
  state = {
    arrowRef: null,
  };

  handleArrowRef = node => {
    this.setState({
      arrowRef: node,
    });
  };

  render() {
    const {
      classes,
      title,
      placement = 'top',
    } = this.props;

    return (
      <Tooltip
        title={
          <React.Fragment>
            <Typography color="inherit">{ title }</Typography>
            <span className={classes.arrowArrow} ref={this.handleArrowRef} />
          </React.Fragment>
        }
        classes={{ tooltip: classes.tooltip, popper: classes.arrowPopper }}
        placement={placement}
        PopperProps={{
          popperOptions: {
            modifiers: {
              arrow: {
                enabled: Boolean(this.state.arrowRef),
                element: this.state.arrowRef,
              },
            },
          },
        }}
      >
        <InfoIcon className={classes.icon} />
      </Tooltip>
    );
  }
}

InfoTooltip.propTypes = {
  title: PropTypes.string.isRequired,
  placement: PropTypes.string,
};

export default withStyles(styles)(InfoTooltip);
