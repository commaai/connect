import React, { Component, Suspense } from 'react';
import PropTypes from 'prop-types';
import { DEV_TOOLS_CHANGED_EVENT, getDeveloperToolsEnabled } from '../../userSettings';
import FullPageLoading from '../FullPageLoading';

let initialLoadClaimed = false;

const now = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

const getLoadStart = () => {
  if (!initialLoadClaimed) {
    initialLoadClaimed = true;
    if (typeof window !== 'undefined' && Number.isFinite(window.__CONNECT_BUNDLE_LOAD_STARTED_AT__)) {
      return window.__CONNECT_BUNDLE_LOAD_STARTED_AT__;
    }
  }
  return now();
};

class ReadyMarker extends Component {
  componentDidMount() {
    this.props.onReady();
  }

  render() {
    return null;
  }
}

ReadyMarker.propTypes = {
  onReady: PropTypes.func.isRequired,
};

class BundleLoadBoundary extends Component {
  constructor(props) {
    super(props);
    this.startedAt = getLoadStart();
    this.animationFrame = null;
    this.state = {
      developerToolsEnabled: getDeveloperToolsEnabled(),
      durationMs: null,
    };
    this.handleReady = this.handleReady.bind(this);
    this.handleDeveloperToolsChanged = this.handleDeveloperToolsChanged.bind(this);
  }

  componentDidMount() {
    window.addEventListener(DEV_TOOLS_CHANGED_EVENT, this.handleDeveloperToolsChanged);
  }

  componentWillUnmount() {
    window.removeEventListener(DEV_TOOLS_CHANGED_EVENT, this.handleDeveloperToolsChanged);
    if (this.animationFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  handleDeveloperToolsChanged(event) {
    this.setState({ developerToolsEnabled: event.detail.enabled });
  }

  handleReady() {
    const finish = () => {
      this.animationFrame = null;
      this.setState({ durationMs: Math.max(0, Math.round(now() - this.startedAt)) });
    };

    if (typeof requestAnimationFrame === 'function') {
      this.animationFrame = requestAnimationFrame(finish);
    } else {
      finish();
    }
  }

  render() {
    const { children } = this.props;
    const { developerToolsEnabled, durationMs } = this.state;

    return (
      <>
        <Suspense fallback={<FullPageLoading />}>
          {children}
          <ReadyMarker onReady={this.handleReady} />
        </Suspense>
        {durationMs === null
          ? <FullPageLoading />
          : developerToolsEnabled && (
            <footer
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[1300] border-t border-white/10 bg-[#16181A]/[.92] px-3 py-1 text-right text-[11px] leading-4 text-white/50"
              data-testid="bundle-load-footer"
            >
              Bundle loaded in {durationMs} ms
            </footer>
          )}
      </>
    );
  }
}

BundleLoadBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

export default BundleLoadBoundary;
