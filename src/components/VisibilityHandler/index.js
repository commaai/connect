import { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import PropTypes from 'prop-types';

class VisibilityHandler extends Component {
  constructor(props) {
    super(props);

    this.prevVisibleCall = 0;
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  componentWillMount() {
    window.addEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.props.onInit) {
      this.prevVisibleCall = Date.now() / 1000;
      this.props.onVisible();
    }
  }

  componentDidUpdate(prevProps) {
    const { dongleId } = this.props;
    if (this.props.onDongleId && prevProps.dongleId !== dongleId) {
      this.prevVisibleCall = Date.now() / 1000;
      this.props.onVisible();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  handleVisibilityChange() {
    const newDate = Date.now() / 1000;
    const dt = newDate - this.prevVisibleCall;
    if (document.visibilityState === "visible" && (!this.props.minInterval || dt > this.props.minInterval)) {
      this.prevVisibleCall = newDate;
      this.props.onVisible();
    }
  }

  render() {
    return null;
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
});

VisibilityHandler.propTypes = {
  onVisible: PropTypes.func.isRequired,
  onInit: PropTypes.bool,
  onDongleId: PropTypes.bool,
  minInterval: PropTypes.number, // in seconds, only for visibility changes
};

export default connect(stateToProps)(VisibilityHandler);
