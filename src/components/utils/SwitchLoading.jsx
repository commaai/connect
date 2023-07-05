import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { withStyles, Switch, FormControlLabel, Popper, Typography } from '@material-ui/core';

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
      content: '\'\'',
      display: 'inline-block',
      height: '100%',
      width: '100%',
      backgroundImage: 'url(\'data:image/svg+xml;utf8,'
        + '<svg xmlns="http://www.w3.org/2000/svg" height="20" width="20" viewBox="0 0 20 20">'
        + '<circle cx="50%25" cy="50%25" r="5" stroke="%23eee" fill="none" stroke-width="2" '
        + 'stroke-dasharray="24px 8px"></circle></svg>\')',
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

class SwitchLoading extends Component {
  constructor(props) {
    super(props);

    this.state = {
      loading: false,
      checked: null,
      error: null,
      errorPopper: null,
    };

    this.onChange = this.onChange.bind(this);
  }

  async onChange(ev) {
    if (this.state.loading) {
      return;
    }

    this.setState({
      loading: true,
      checked: ev.target.checked,
      error: null,
    });

    const res = await this.props.onChange(ev);
    if (res?.error) {
      this.setState({
        loading: false,
        checked: null,
        error: res.error,
      });
      return;
    }

    this.setState({
      loading: false,
      checked: null,
      error: null,
    });
  }

  render() {
    const { classes, checked, label, loading, tooltip } = this.props;

    const isChecked = this.state.checked !== null ? this.state.checked : checked;
    const loadingCls = (loading || this.state.loading) ? { icon: classes.switchThumbLoading } : {};

    const switchEl = (
      <Switch
        color="secondary"
        checked={ isChecked }
        onChange={ this.onChange }
        classes={ loadingCls }
        disabled={ loading }
      />
    );

    return (
      <div className={ classes.root }>
        <FormControlLabel control={ switchEl } label={ label } />
        { tooltip && <InfoTooltip title={tooltip} /> }
        { Boolean(this.state.error) && (
        <>
          <ErrorOutline
            className={ classes.errorIcon }
            onMouseLeave={ () => this.setState({ errorPopper: null }) }
            onMouseEnter={ (ev) => this.setState({ errorPopper: ev.target }) }
          />
          <Popper
            open={ Boolean(this.state.errorPopper) }
            placement="bottom"
            anchorEl={ this.state.errorPopper }
            className={classes.copiedPopover}
          >
            <Typography>{ this.state.error }</Typography>
          </Popper>
        </>
        )}
      </div>
    );
  }
}

SwitchLoading.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  label: PropTypes.string,
  tooltip: PropTypes.string,
};

export default withStyles(styles)(SwitchLoading);
