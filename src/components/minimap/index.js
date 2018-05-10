// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux'
import TimelineWorker from '../../timeline';

class Minimap extends Component {
  render () {
    return (
      <pre>{ JSON.stringify(this.props, null, 2) }</pre>
    );
  }
}

export default connect(mapStateToProps)(Minimap);

function mapStateToProps(state) {
  return state;
}
