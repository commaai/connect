import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';
import * as Sentry from '@sentry/react';

import { withStyles, Typography, CircularProgress, Popper, Popover } from '@material-ui/core';
import LockOutlineIcon from '@material-ui/icons/LockOutline';
import PublicIcon from '@material-ui/icons/Public';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import { clips as ClipsApi } from '@commaai/comma-api';

import { video_360 } from '../../icons';
import { filterRegularClick } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { fetchClipsList, navToClips } from '../../actions/clips';
import VisibilityHandler from '../VisibilityHandler';

const styles = () => ({
  clipItemHeader: {
    display: 'flex',
    alignItems: 'center',
    color: Colors.white,
    padding: 3,
    '& h6': {
      padding: '0 3px',
      margin: 0,
    },
  },
  clipItem: {
    display: 'flex',
    alignItems: 'center',
    color: Colors.white,
    borderTop: '1px solid rgba(255, 255, 255, .05)',
    textDecoration: 'none',
    padding: 3,
    cursor: 'pointer',
    '&:hover': {},
    '& p': {
      padding: '0 3px',
      margin: 0,
      textAlign: 'center',
    },
  },
  clipTitle: {
    'p&': {
      textAlign: 'left',
    }
  },
  clipPlayIcon: {
    paddingRight: 3,
    fontSize: '1.4rem',
  },
  thumbnail: {
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    '& img': {
      height: '50%',
    },
  },
  noClips: {
    color: Colors.white,
    fontSize: '1rem',
  },
  copiedPopover: {
    borderRadius: 16,
    padding: '8px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    marginTop: 12,
    zIndex: 5000,
    maxWidth: '95%',
    '& p': {
      maxWidth: 400,
      fontSize: '0.9rem',
      color: Colors.white,
      margin: 0,
    },
  },
});

class ClipList extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      copiedPopover: null,
      errorPopper: null,
      errorTexts: {},
    };

    this.onResize = this.onResize.bind(this);
    this.shareClip = this.shareClip.bind(this);
    this.renderClipItem = this.renderClipItem.bind(this);
    this.fetchShowError = this.fetchShowError.bind(this);
    this.clipErrorToText = this.clipErrorToText.bind(this);

    this.popoverTimeout = null;
    this.clipErrors
  }

  async shareClip(ev, c) {
    ev.stopPropagation();
    ev.preventDefault();
    try {
      const url = `${window.location.origin}/${c.dongle_id}/clips/${c.clip_id}`;
      if (typeof navigator.share !== 'undefined') {
        await navigator.share({
          title: 'comma connect',
          url: url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        this.setState({ copiedPopover: ev.target });
        if (this.popoverTimeout) {
          clearTimeout(this.popoverTimeout);
        }
        this.popoverTimeout = setTimeout(() => {
          this.setState({ copiedPopover: null });
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'clip_list_share' });
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  clipErrorToText(error_status) {
    switch (error_status) {
    case 'upload_failed_request':
      return 'Was unable to request file upload from device.';
    case 'upload_failed':
      return 'Not all files needed for this clip could be found on the device.';
    case 'upload_failed_dcam':
      return 'Not all files needed for this clip could be found on the device, was the "Record and Upload Driver Camera" toggle active?';
    case 'upload_timed_out':
      return 'File upload timed out, the device must be on WiFi to upload the required files.';
    case 'export_failed':
      return 'An error occured while creating this clip.';
    default:
      return 'Was not able to create clip.';
    }
  }

  async fetchShowError(target, c) {
    const { errorTexts } = this.state;

    let errorText;
    if (errorTexts[c.clip_id]) {
      errorText = errorTexts[c.clip_id];
    } else {
      this.setState({ errorPopper: { ref: target } });
      try {
        const resp = await ClipsApi.clipsDetails(this.props.dongleId, c.clip_id);
        errorText = this.clipErrorToText(resp.error_status);
        const newErrorTexts = { ...errorTexts };
        newErrorTexts[resp.id] = errorText;
        this.setState({ errorTexts: newErrorTexts });
      } catch (err) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'clips_list_failed_details' });
        return;
      }
    }

    this.setState({
      errorPopper: {
        ref: target,
        text: errorText,
      },
    });
  }

  render() {
    const { classes, clips } = this.props;
    const { windowWidth, copiedPopover, errorPopper } = this.state;

    const viewerPadding = windowWidth < 768 ? 12 : 32;

    const tbnWidth = (windowWidth < 768 ? 48 : 54) * (1928/1208);

    const gridWidths = windowWidth < 768 ?
      [`calc(2% + ${tbnWidth}px)`, `calc(67% - ${tbnWidth}px)`, '24%', '7%'] :
      [`calc(3% + ${tbnWidth}px)`, `calc(65% - ${tbnWidth}px)`, '24%', '7%'];
    const gridStyles = gridWidths.map((w) => ({ maxWidth: w, flexBasis: w }));

    const itemStyle = windowWidth < 768 ? { fontSize: '0.9rem' } : { fontSize: '1rem' };

    return <>
      <VisibilityHandler onVisible={ () => this.props.dispatch(fetchClipsList(this.props.dongleId)) }
        onDongleId={ true } />
      <ResizeHandler onResize={ this.onResize } />

      <div style={{ ...itemStyle, padding: viewerPadding }}>
        { !clips.list && <CircularProgress style={{ margin: 12, color: Colors.white }} size={ 20 } /> }
        { Boolean(clips.list && clips.list.length === 0) && <p className={ classes.noClips }>no clips found</p> }
        { Boolean(clips.list && clips.list.length > 0) &&
          <div className={classes.clipItemHeader} style={{ padding: (windowWidth < 768 ? 3 : 8) }}>
            <h6 style={{ ...itemStyle, ...gridStyles[0] }}></h6>
            <h6 style={{ ...itemStyle, ...gridStyles[1] }}>Title</h6>
            <h6 style={{ ...itemStyle, ...gridStyles[2], textAlign: 'center' }}>Date</h6>
            <h6 style={{ ...itemStyle, ...gridStyles[3] }}>Public</h6>
          </div>
        }
        { clips.list && clips.list.map((c) => this.renderClipItem(gridStyles, c)) }
      </div>

      <Popper open={ Boolean(copiedPopover) } placement='bottom' anchorEl={ copiedPopover }
        className={ classes.copiedPopover }>
        <Typography>copied to clipboard</Typography>
      </Popper>
      <Popover open={ Boolean(errorPopper) } anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        anchorEl={ errorPopper?.ref } classes={{ paper: classes.copiedPopover }}
        onClose={ () => this.setState({ errorPopper: null }) }>
        { errorPopper?.text ?
          <Typography>{ errorPopper?.text }</Typography> :
          <CircularProgress style={{ margin: '2px 12px', color: Colors.white }} size={ 14 } />
        }
      </Popover>
    </>;
  }

  renderClipItem(gridStyles, c) {
    const { classes, dongleId } = this.props;
    const { windowWidth } = this.state;

    // don't show old failed clips
    if (c.status === 'failed' && (Date.now()/1000 - c.create_time) > 86400*7) {
      return;
    }

    const itemStyle = windowWidth < 768 ? { fontSize: '0.9rem' } : { fontSize: '1.0rem' };

    const timeStr = fecha.format(new Date(c.start_time), 'MMM\u00a0D h:mm\u00a0a').toLowerCase();

    let thumbnail = null;
    if (c.status === 'done') {
      const thumbnailStyle = {
        ...gridStyles[0],
        backgroundImage: `url("${c.thumbnail}")`,
        height: (windowWidth < 768 ? 48 : 54),
      };
      thumbnail = <div className={ classes.thumbnail } style={ thumbnailStyle }>
        { c.video_type === '360' && <img src={ video_360 } /> }
      </div>;
    } else if (c.status === 'pending') {
      thumbnail = <MoreHorizIcon className={ classes.clipPlayIcon } style={ gridStyles[0] } />;
    } else if (c.status === 'failed') {
      thumbnail = <ErrorOutlineIcon className={ classes.clipPlayIcon }
        style={{ ...gridStyles[0], color: Colors.red300 }} />;
    }

    const innerItem = <>
      { thumbnail }
      <p style={{ ...itemStyle, ...gridStyles[1] }} className={ classes.clipTitle }>
        { c.title ? c.title : c.route_name.split('|')[1] }
      </p>
      <p style={{ ...itemStyle, ...gridStyles[2] }}>{ timeStr }</p>
      { c.is_public ?
        <PublicIcon style={{ ...gridStyles[3], fontSize: (windowWidth < 768 ? '1.0rem' : '1.2rem') }}
          onClick={ (ev) => { ev.persist(); this.shareClip(ev, c); } } /> :
        <LockOutlineIcon style={{ ...gridStyles[3], fontSize: (windowWidth < 768 ? '1.0rem' : '1.2rem') }} />
      }
    </>;

    if (c.status === 'failed') {
      return <div key={c.clip_id} className={classes.clipItem} onClick={ (ev) => this.fetchShowError(ev.target, c) }>
        { innerItem }
      </div>;
    }

    return (
      <a key={c.clip_id} className={classes.clipItem} href={ `/${dongleId}/clips/${c.clip_id}` }
        onClick={ filterRegularClick(() => this.props.dispatch(navToClips(c.clip_id, c.state))) }>
        { innerItem }
      </a>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  clips: 'clips',
});

export default connect(stateToProps)(withStyles(styles)(ClipList));
