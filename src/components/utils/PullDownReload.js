import React, { Component } from 'react';

import { withStyles } from '@material-ui/core';
import ReplayIcon from '@material-ui/icons/Replay';

import Colors from '../../colors';

const styles = (theme) => ({
  root: {
    display: 'none',
    position: 'absolute',
    zIndex: 5050,
    top: -48,
    left: 'calc(50% - 24px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    backgroundColor: Colors.grey100,
    borderRadius: 24,
  },
});

class PullDownReload extends Component {
  constructor(props) {
    super(props);

    this.state = {
      startY: null,
      reloading: false,
    };

    this.dragEl = React.createRef(null);

    this.touchStart = this.touchStart.bind(this);
    this.touchMove = this.touchMove.bind(this);
    this.touchEnd = this.touchEnd.bind(this);
  }

  async componentDidMount() {
    if (window && window.navigator) {
      const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
      const isStandalone = window.navigator.standalone === true;
      if (isIos && isStandalone) {
        document.addEventListener('touchstart', this.touchStart, { passive: false });
        document.addEventListener('touchmove', this.touchMove, { passive: false });
        document.addEventListener('touchend', this.touchEnd, { passive: false });
      }
    }
  }

  touchStart(ev) {
    if (document.scrollingElement.scrollTop !== 0 || ev.defaultPrevented) {
      return;
    }

    this.setState({ startY: ev.touches[0].pageY });
  }

  touchMove(ev) {
    const { startY } = this.state;
    if (startY === null || !this.dragEl.current) {
      return;
    }

    const top = Math.min((ev.touches[0].pageY - startY) / 2 - 48, 32);
    this.dragEl.current.style.transition = 'unset';
    this.dragEl.current.style.top = `${top}px`;
    if (ev.touches[0].pageY - startY > 0) {
      ev.preventDefault();
    } else {
      this.setState({ startY: null });
      this.dragEl.current.style.transition = 'top 0.1s';
      this.dragEl.current.style.top = '-48px';
    }
  }

  touchEnd() {
    if (this.state.startY === null || !this.dragEl.current) {
      return;
    }

    const top = parseInt(this.dragEl.current.style.top.substring(0, this.dragEl.current.style.top.length - 2), 10);
    if (top >= 32 && !this.state.reloading) {
      this.setState({ reloading: true });
      window.location.reload();
    } else {
      this.setState({ startY: null });
      this.dragEl.current.style.transition = 'top 0.1s';
      this.dragEl.current.style.top = '-48px';
    }
  }

  render() {
    const { classes } = this.props;

    return (
      <div className={ classes.root } ref={ this.dragEl }>
        <ReplayIcon />
      </div>
    );
  }
}

export default withStyles(styles)(PullDownReload);
