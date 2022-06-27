import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, IconButton } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';

import Colors from '../../colors';
import { fetchEvents } from '../../actions/cached';
import { clipBack } from '../../actions/clips';
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

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.currentSegment !== this.props.currentSegment && this.props.currentSegment) {
      this.props.dispatch(fetchEvents(this.props.currentSegment));
    }
  }

  render() {
    const { classes, clip } = this.props;

    return <>
      <div className={classes.window} >
        <div className={classes.headerContext}>
          <IconButton onClick={ () => this.props.dispatch(clipBack()) }>
            <CloseIcon />
          </IconButton>
          <div className={ classes.headerInfo }>
            { clip.state === 'done' ? 'View clip' : 'Create a clip' }
          </div>
          <IconButton onClick={ () => this.setState({ modal: 'help' }) }>
            <HelpOutlineIcon />
          </IconButton>
        </div>
        { clip.state === 'create' ? <ClipCreate /> : null }
        { clip.state === 'upload' ? <ClipUpload /> : null }
        { clip.state === 'done' ? <ClipDone /> : null }
      </div>
    </>;
  }
}

const stateToProps = Obstruction({
  currentSegment: 'currentSegment',
  dongleId: 'dongleId',
  clip: 'clip',
});

export default connect(stateToProps)(withStyles(styles)(ClipView));
