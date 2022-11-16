import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';
import { clips as Clips } from '@commaai/api';

import {
  withStyles,
  CircularProgress,
  Grid,
  Popover,
  Popper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@material-ui/core';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import LockOutlineIcon from '@material-ui/icons/LockOutline';
import PublicIcon from '@material-ui/icons/Public';
import WallpaperIcon from '@material-ui/icons/Wallpaper';

import { fetchClipsList, navToClips } from '../../actions/clips';
import Colors from '../../colors';
import { Video360Icon } from '../../icons';
import { filterRegularClick } from '../../utils';
import { clipErrorToText, formatClipDuration, formatClipTimestamp } from '../../utils/clips';
import VisibilityHandler from '../VisibilityHandler';
import BackgroundImage from '../utils/BackgroundImage';

const styles = (theme) => ({
  columnDuration: {
    [theme.breakpoints.down('xs')]: {
      display: 'none',
    },
  },
  columnCreationTime: {
    [theme.breakpoints.down('sm')]: {
      display: 'none',
    },
  },
  clipItem: {
    cursor: 'pointer',
    height: 96,
    [theme.breakpoints.down('sm')]: {
      height: 64,
    },
    [theme.breakpoints.down('xs')]: {
      height: 48,
    },
  },
  thumbnail: {
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    '& img': {
      height: '50%',
    },
    height: 96,
    [theme.breakpoints.down('sm')]: {
      height: 64,
    },
    [theme.breakpoints.down('xs')]: {
      height: 48,
    },
  },
  thumbnailPlaceholder: {
    padding: 24,
    width: '100%',
    height: '100%',
  },
  noClips: {
    fontSize: '1rem',
    margin: '48px 32px',
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
      copiedPopover: null,
      errorPopper: null,
      errorTexts: {},
    };

    this.shareClip = this.shareClip.bind(this);
    this.renderClipItem = this.renderClipItem.bind(this);
    this.fetchShowError = this.fetchShowError.bind(this);

    this.popoverTimeout = null;
  }

  async shareClip(ev, c) {
    ev.stopPropagation();
    ev.preventDefault();
    try {
      const url = `${window.location.origin}/${c.dongle_id}/clips/${c.clip_id}`;
      if (typeof navigator.share !== 'undefined') {
        await navigator.share({
          title: 'comma connect',
          url,
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

  async fetchShowError(target, c) {
    const { dongleId } = this.props;
    const { errorTexts } = this.state;

    let errorText;
    if (errorTexts[c.clip_id]) {
      errorText = errorTexts[c.clip_id];
    } else {
      this.setState({ errorPopper: { ref: target } });
      try {
        const resp = await Clips.clipsDetails(dongleId, c.clip_id);
        errorText = clipErrorToText(resp.error_status);
        this.setState({
          errorTexts: {
            ...errorTexts,
            [c.clip_id]: errorText,
          },
        });
      } catch (err) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'clips_list_failed_details' });
        return;
      }
    }

    this.setState({
      errorPopper: {
        ref: target,
        text: (
          <>
            <Typography variant="body1">{errorText}</Typography>
            <Typography variant="caption">{`Clip ID: ${c.clip_id}`}</Typography>
          </>
        ),
      },
    });
  }

  renderClipItem(clip) {
    const { classes, dispatch } = this.props;

    let status;
    if (clip.status === 'failed') {
      status = (
        <Tooltip title="Error">
          <ErrorOutlineIcon color="error" />
        </Tooltip>
      );
    } else if (clip.status === 'pending') {
      if (clip.pending_progress) {
        const progress = parseFloat(clip.pending_progress) * 100;
        status = (
          <Tooltip title={`Export in progress (${progress.toFixed(0)}%)`}>
            <CircularProgress size={24} variant="static" value={progress} />
          </Tooltip>
        );
      } else {
        status = (
          <Tooltip title="Export in progress">
            <CircularProgress size={24} />
          </Tooltip>
        );
      }
    } else if (clip.is_public) {
      status = (
        <Tooltip title="Publicly accessible">
          <PublicIcon />
        </Tooltip>
      );
    } else {
      status = (
        <Tooltip title="Private">
          <LockOutlineIcon />
        </Tooltip>
      );
    }

    let onClick;
    if (clip.status === 'failed') {
      onClick = (ev) => this.fetchShowError(ev.target, clip);
    } else {
      onClick = filterRegularClick(() => dispatch(navToClips(clip.clip_id, clip.state)));
    }

    let overlay;
    if (clip.video_type === '360') {
      overlay = <Video360Icon className={classes.thumbnailPlaceholder} />;
    }

    const clipTime = formatClipTimestamp(clip.start_time);
    return (
      <TableRow
        key={clip.clip_id}
        className={classes.clipItem}
        onClick={onClick}
        hover
        role="link"
      >
        <TableCell padding="none">
          <BackgroundImage
            className={classes.thumbnail}
            src={clip.thumbnail}
            overlay={overlay}
          >
            <WallpaperIcon className={classes.thumbnailPlaceholder} />
          </BackgroundImage>
        </TableCell>
        <TableCell>
          {clip.title ? (
            <>
              <Typography variant="body2">{clip.title}</Typography>
              <Typography variant="caption">{`Recorded at ${clipTime}`}</Typography>
            </>
          ) : (
            <Typography variant="body2">{clipTime}</Typography>
          )}
        </TableCell>
        <TableCell className={classes.columnDuration}>
          {formatClipDuration(clip.end_time - clip.start_time)}
        </TableCell>
        <TableCell className={classes.columnCreationTime}>
          {formatClipTimestamp(clip.create_time)}
        </TableCell>
        <TableCell>
          {status}
        </TableCell>
      </TableRow>
    );
  }

  render() {
    const { classes, clips, dispatch, dongleId } = this.props;
    const { copiedPopover, errorPopper } = this.state;

    let content;
    if (clips?.length > 0) {
      content = (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Name</TableCell>
              <TableCell className={classes.columnDuration}>Duration</TableCell>
              <TableCell className={classes.columnCreationTime}>Created at</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {clips && clips.map(this.renderClipItem)}
          </TableBody>
        </Table>
      );
    } else if (clips?.length === 0) {
      content = (
        <Typography variant="body1" className={classes.noClips}>
          no clips found
        </Typography>
      );
    } else {
      content = (
        <Grid container alignItems="center" style={{ width: '100%', height: '30vh' }}>
          <Grid item align="center" xs={12}>
            <CircularProgress size="5vh" style={{ color: '#525E66' }} />
          </Grid>
        </Grid>
      );
    }

    return (
      <>
        <VisibilityHandler onVisible={() => dispatch(fetchClipsList(dongleId))} onDongleId />

        {content}

        <Popper
          open={ Boolean(copiedPopover) }
          placement="bottom"
          anchorEl={ copiedPopover }
          className={ classes.copiedPopover }
        >
          <Typography>copied to clipboard</Typography>
        </Popper>
        <Popover
          open={ Boolean(errorPopper) }
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          anchorEl={ errorPopper?.ref }
          classes={{ paper: classes.copiedPopover }}
          onClose={ () => this.setState({ errorPopper: null }) }
        >
          { errorPopper?.text || <CircularProgress style={{ margin: '2px 12px', color: Colors.white }} size={ 14 } /> }
        </Popover>
      </>
    );
  }
}

const mapStateToProps = (state) => {
  const { clips: { list: clips }, dongleId } = state;

  if (clips?.length > 0) {
    return {
      // don't show old failed clips
      clips: clips.filter((c) => c.status !== 'failed'
        || (Date.now() / 1000 - c.create_time) < 86400 * 7),
      dongleId,
    };
  }

  return {
    clips,
    dongleId,
  };
};

export default connect(mapStateToProps)(withStyles(styles)(ClipList));
