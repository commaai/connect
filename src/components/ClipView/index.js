import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, IconButton, Typography, TextField, Button } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';

import DriveVideo from '../DriveVideo';
import Timeline from '../Timeline';
import ResizeHandler from '../ResizeHandler';
import TimeDisplay from '../TimeDisplay';
import Colors from '../../colors';
import { fetchEvents } from '../../actions/cached';
import { clipBack, clipCreate } from '../../actions/clip';

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
  clipOption: {
    marginTop: 12,
    width: '100%',
    '& h4': {
      color: Colors.white,
      margin: '0 0 5px 0',
      fontSize: '1rem',
    },
  },
  videoTypeOptions: {
    display: 'flex',
    width: 'max-content',
    alignItems: 'center',
    display: 'flex',
  },
  videoTypeOption: {
    height: 32,
    width: 84,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: `1px solid ${Colors.white10}`,
    borderRight: 'none',
    '&.selected': {
      backgroundColor: Colors.grey950,
    },
    '&:first-child': {
      borderRadius: '16px 0 0 16px',
    },
    '&:last-child': {
      borderRadius: '0 16px 16px 0',
      borderRight: `1px solid ${Colors.white10}`,
    },
  },
  clipLabelInput: {
    '& div': {
      border: `1px solid ${Colors.white10}`,
    },
    '& input': {
      padding: '6px 16px',
    },
  },
});

class ClipView extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      modal: null,
      videoTypeOption: 'f',
      clipLabel: null,
    };

    this.onResize = this.onResize.bind(this);
    this.onclipCreate = this.onclipCreate.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, PrevState) {
    if (prevProps.currentSegment !== this.props.currentSegment && this.props.currentSegment) {
      this.props.dispatch(fetchEvents(this.props.currentSegment));
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  onclipCreate() {
    const { videoTypeOption, clipLabel } = this.state;
    this.props.dispatch(clipCreate(videoTypeOption, clipLabel));
  }

  render() {
    const { classes, clip } = this.props;

    return <>
      <ResizeHandler onResize={ this.onResize } />
      <div className={classes.window} >
        <div className={classes.headerContext}>
          <IconButton onClick={ () => this.props.dispatch(clipBack()) }>
            { clip.state === 'create' ? <CloseIcon /> : <ArrowBackIcon /> }
          </IconButton>
          <div className={ classes.headerInfo }>
            Create a clip
          </div>
          <IconButton onClick={ () => this.setState({ modal: 'help' }) }>
            <HelpOutlineIcon />
          </IconButton>
        </div>
        { clip.state === 'create' ? this.renderCreate() : null }
        { clip.state === 'upload' ? this.renderUpload() : null }
      </div>
    </>;
  }

  renderCreate() {
    const { classes } = this.props;
    const { videoTypeOption, clipLabel } = this.state;
    const viewerPadding = this.state.windowWidth < 768 ? 12 : 32

    return <>
      <Timeline className={classes.headerTimeline} thumbnailsVisible={ true } hasClip />
      <div style={{ padding: viewerPadding }}>
        <DriveVideo />
        <div className={ classes.clipOption }>
          <TimeDisplay isThin />
        </div>
        <div className={ classes.clipOption }>
          <h4>Video type</h4>
          <div className={classes.videoTypeOptions}>
            <div className={ `${classes.videoTypeOption} ${videoTypeOption === 'f' ? 'selected' : ''}` }
              onClick={ () => this.setState({ videoTypeOption: 'f' }) }>
              <Typography className={classes.mediaOptionText}>Front</Typography>
            </div>
            <div className={ `${classes.videoTypeOption} ${videoTypeOption === 'e' ? 'selected' : ''}` }
              onClick={ () => this.setState({ videoTypeOption: 'e' }) }>
              <Typography className={classes.mediaOptionText}>Wide</Typography>
            </div>
            <div className={ `${classes.videoTypeOption} ${videoTypeOption === 'd' ? 'selected' : ''}` }
              onClick={ () => this.setState({ videoTypeOption: 'd' }) }>
              <Typography className={classes.mediaOptionText}>Cabin</Typography>
            </div>
          </div>
        </div>
        <div className={ classes.clipOption }>
          <h4>Clip title</h4>
          <TextField className={ classes.clipLabelInput } value={ clipLabel ? clipLabel : '' }
            onChange={ (ev) =>this.setState({ clipLabel: ev.target.value }) } />
        </div>
        <div className={ classes.clipOption }>
          <Button variant="outlined" onClick={ this.onclipCreate }>
            Create clip
          </Button>
        </div>
      </div>
    </>;
  }

  renderUpload() {
    return <>
    </>;
  }
}

const stateToProps = Obstruction({
  currentSegment: 'currentSegment',
  dongleId: 'dongleId',
  zoom: 'zoom',
  clip: 'clip',
});

export default connect(stateToProps)(withStyles(styles)(ClipView));
