import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, IconButton } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';

import Colors from '../../colors';
import { fetchEvents } from '../../actions/cached';
import { clipsExit } from '../../actions/clips';
import ClipList from './ClipList';
import ClipCreate from './ClipCreate';
import ClipUpload from './ClipUpload';
import ClipDone from './ClipDone';

const styles = (theme) => ({
  window: {
    background: 'linear-gradient(to bottom, #30373B 0%, #272D30 10%, #1D2225 100%)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    margin: 18,
  },
  headerContext: {
    alignItems: 'center',
    justifyContent: 'space-between',
    display: 'flex',
    padding: 12,
  },
  headerInfo: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 500,
    paddingLeft: 12,
  },
  error: {
    color: Colors.white,
    fontSize: '0.9rem',
    padding: '12px 24px',
  },
});

class ClipView extends Component {
  constructor(props) {
    super(props);

    this.state = {
      modal: null,
    };
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps) {
    if (prevProps.currentRoute !== this.props.currentRoute && this.props.currentRoute) {
      this.props.dispatch(fetchEvents(this.props.currentRoute));
    }
  }

  render() {
    const { classes, clips } = this.props;

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

    return <>
      <div className={classes.window} >
        <div className={classes.headerContext}>
          <IconButton onClick={ () => this.props.dispatch(clipsExit()) }>
            <CloseIcon />
          </IconButton>
          <div className={ classes.headerInfo }>
            { title }
          </div>
          <div style={{ width: 48 }}/>
          {/* <IconButton onClick={ () => this.setState({ modal: 'help' }) }>
            <HelpOutlineIcon />
          </IconButton> */}
        </div>
        { clips.state === 'list' ? <ClipList /> : null }
        { clips.state === 'create' ? <ClipCreate /> : null }
        { clips.state === 'upload' ? <ClipUpload /> : null }
        { clips.state === 'done' ? <ClipDone /> : null }
        { clips.state === 'error' ? <div className={ classes.error }>{ text }</div> : null }

      </div>
    </>;
  }
}

const stateToProps = Obstruction({
  currentRoute: 'currentRoute',
  dongleId: 'dongleId',
  clips: 'clips',
});

export default connect(stateToProps)(withStyles(styles)(ClipView));
