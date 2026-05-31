import { Component } from 'react';

import { isIos } from '../../utils/browser.js';

// iOS PWAs in standalone mode don't get the system pull-to-refresh — there's no
// browser chrome to host it. Re-create the iOS Safari look (page rubber-bands
// down with damping; release past threshold to reload) by translating the app
// root during the pull. No spinner / Material indicator.
const PULL_THRESHOLD = 80;     // px of pull required to trigger a reload
const PULL_MAX = 200;           // hard cap on translate distance
const PULL_DAMPING = 0.55;      // exponent < 1 means resistance grows with pull
const RELEASE_DURATION = 250;   // ms for the rubber-band-back animation
const EDGE_IGNORE = 30;         // px from screen edges to leave for iOS edge-swipe

class PullDownReload extends Component {
  constructor(props) {
    super(props);

    this.startY = null;
    this.pulled = 0;
    this.reloading = false;

    this.touchStart = this.touchStart.bind(this);
    this.touchMove = this.touchMove.bind(this);
    this.touchEnd = this.touchEnd.bind(this);
  }

  componentDidMount() {
    if (window && window.navigator) {
      const isStandalone = window.navigator.standalone === true;
      if (isIos() && isStandalone) {
        document.addEventListener('touchstart', this.touchStart, { passive: false });
        document.addEventListener('touchmove', this.touchMove, { passive: false });
        document.addEventListener('touchend', this.touchEnd, { passive: false });
        document.addEventListener('touchcancel', this.touchEnd, { passive: false });
      }
    }
  }

  componentWillUnmount() {
    document.removeEventListener('touchstart', this.touchStart);
    document.removeEventListener('touchmove', this.touchMove);
    document.removeEventListener('touchend', this.touchEnd);
    document.removeEventListener('touchcancel', this.touchEnd);
    this.resetTransform();
  }

  resetTransform() {
    document.body.style.transform = '';
    document.body.style.transition = '';
  }

  touchStart(ev) {
    if (document.scrollingElement.scrollTop !== 0 || ev.defaultPrevented) {
      return;
    }
    // Don't capture iOS' system back-swipe gestures from the screen edges.
    const x = ev.touches[0].pageX;
    if (x < EDGE_IGNORE || x > window.innerWidth - EDGE_IGNORE) {
      return;
    }

    this.startY = ev.touches[0].pageY;
    this.pulled = 0;
    document.body.style.transition = '';
  }

  touchMove(ev) {
    if (this.startY === null) return;

    const dy = ev.touches[0].pageY - this.startY;
    if (dy <= 0) {
      // user reversed direction; stop intercepting and let normal scrolling resume
      this.startY = null;
      this.pulled = 0;
      this.resetTransform();
      return;
    }

    // Damped translate: pulling further produces diminishing movement, capped at PULL_MAX.
    this.pulled = Math.min(PULL_MAX, dy ** PULL_DAMPING);
    document.body.style.transform = `translateY(${this.pulled}px)`;
    ev.preventDefault();
  }

  touchEnd() {
    if (this.startY === null) return;
    const pulled = this.pulled;
    this.startY = null;
    this.pulled = 0;

    document.body.style.transition = `transform ${RELEASE_DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
    document.body.style.transform = '';

    if (pulled >= PULL_THRESHOLD && !this.reloading) {
      this.reloading = true;
      // Let the rubber-band animate back before reloading, otherwise the
      // transition gets cut short and feels janky on slow networks.
      setTimeout(() => window.location.reload(), RELEASE_DURATION);
    }
  }

  render() {
    return null;
  }
}

export default PullDownReload;
