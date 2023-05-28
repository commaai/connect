import {Component, createElement} from 'react';
import PropTypes from 'prop-types';

const propTypes = {
  redraw: PropTypes.func.isRequired,
  style: PropTypes.object
};

export default class MapOverlay extends Component {
  render() {
    const style = Object.assign({
      position: 'absolute',
      left: 0,
      top: 0,
    }, this.props.style);

    return (
      createElement('div', {
        ref: 'overlay',
        style
      },
        this.props.redraw()
      )
    );
  }
}

MapOverlay.displayName = 'MapOverlay';
MapOverlay.propTypes = propTypes;
