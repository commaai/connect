import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { fetchEvents } from '../../actions/cached';
import { clipsExit } from '../../actions/clips';
import ConnectWindow from '../ConnectWindow';
import ClipList from './ClipList';
import ClipCreate from './ClipCreate';
import ClipUpload from './ClipUpload';
import ClipDone from './ClipDone';

class ClipView extends Component {
  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, dispatch } = this.props;
    if (prevProps.currentRoute !== currentRoute && currentRoute) {
      dispatch(fetchEvents(currentRoute));
    }
  }

  render() {
    const { classes, clips, dispatch } = this.props;

    let title = 'Create a clip';
    let text = null;
    if (clips.state === 'done') {
      title = 'View clip';
    } else if (clips.state === 'list') {
      title = 'View clips';
    } else if (clips.state === 'error') {
      title = 'View clip';
      if (clips.error === 'clip_doesnt_exist') {
        text = 'Could not find this clip';
      }
    } else if (clips.state === 'loading') {
      title = '';
    }

    return (
      <ConnectWindow title={title} onClose={() => dispatch(clipsExit())}>
        {clips.state === 'list' ? <ClipList /> : null}
        {clips.state === 'create' ? <ClipCreate /> : null}
        {clips.state === 'upload' ? <ClipUpload /> : null}
        {clips.state === 'done' ? <ClipDone /> : null}
        {clips.state === 'error' ? <div className="text-white py-3 px-6">{text}</div> : null}
      </ConnectWindow>
    );
  }
}

const stateToProps = Obstruction({
  currentRoute: 'currentRoute',
  dongleId: 'dongleId',
  clips: 'clips',
});

export default connect(stateToProps)(ClipView);
