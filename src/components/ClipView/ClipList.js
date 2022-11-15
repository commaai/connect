import React, { Component } from 'react';
import { connect } from 'react-redux';
import fecha from 'fecha';
import * as Sentry from '@sentry/react';

import {
  withStyles,
  CircularProgress,
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
import LockOutlineIcon from '@material-ui/icons/LockOutline';
import PublicIcon from '@material-ui/icons/Public';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import SlideshowIcon from '@material-ui/icons/Slideshow';
import { clips as Clips } from '@commaai/api';

import { fetchClipsList, navToClips } from '../../actions/clips';
import Colors from '../../colors';
import { Video360Icon } from '../../icons';
import { filterRegularClick, formatClipDuration } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';

const styles = (theme) => ({
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
    },
  },
  clipPlayIcon: {
    paddingRight: 3,
    fontSize: '1.4rem',
  },
  clipDuration: {
    [theme.breakpoints.down('xs')]: {
      display: 'none',
    },
  },
  clipCreationTime: {
    [theme.breakpoints.down('sm')]: {
      display: 'none',
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
    [theme.breakpoints.down('xs')]: {
      height: 48,
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

const clipErrorToText = (errorStatus) => {
  switch (errorStatus) {
    case 'upload_failed_request':
      return 'Unable to request file upload from device.';
    case 'upload_failed':
      return 'Not all files needed for this clip could be found on the device.';
    case 'upload_failed_dcam':
      return 'Not all files needed for this clip could be found on the device, was the "Record and Upload Driver Camera" toggle active?';
    case 'upload_timed_out':
      return 'File upload timed out, the device must be on WiFi to upload the required files.';
    case 'export_failed':
      return 'An error occurred while creating this clip.';
    default:
      return 'Unable to create clip.';
  }
};

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

    const formatMask = 'MMM Do, hh:mm a';
    const clipTime = fecha.format(clip.start_time, formatMask);

    let thumbnail = null;
    let status;
    if (clip.status === 'failed') {
      status = <ErrorOutlineIcon color="error" />;
    } else if (clip.status === 'pending') {
      clip.pending_progress = '0.2';
      if (clip.pending_progress) {
        const progress = parseFloat(clip.pending_progress) * 100;
        status = (
          <Tooltip title={`Export in progress (${progress.toFixed(0)}%)`}>
            <CircularProgress size={24} variant="static" value={progress} />
          </Tooltip>
        );
      } else {
        status = <CircularProgress size={24} />;
      }
    } else {
      if (clip.thumbnail) {
        const thumbnailStyle = {
          backgroundImage: `url("${clip.thumbnail}")`,
        };
        thumbnail = (
          <div className={classes.thumbnail} style={thumbnailStyle}>
            {clip.video_type === '360' && <Video360Icon />}
          </div>
        );
      } else {
        thumbnail = 'test';
      }

      if (clip.is_public) {
        status = <PublicIcon />;
      } else {
        status = <LockOutlineIcon />;
      }
    }

    let onClick;
    if (clip.status === 'failed') {
      onClick = (ev) => this.fetchShowError(ev.target, clip);
    } else {
      onClick = filterRegularClick(() => dispatch(navToClips(clip.clip_id, clip.state)));
    }

    return (
      <TableRow key={clip.clip_id} onClick={onClick} hover={!!onClick}>
        <TableCell padding="none">
          {thumbnail}
        </TableCell>
        <TableCell height="64px">
          {clip.title ? (
            <>
              <Typography variant="body2">{clip.title}</Typography>
              <Typography variant="caption">{`Recorded at ${clipTime}`}</Typography>
            </>
          ) : (
            <Typography variant="body2">{clipTime}</Typography>
          )}
        </TableCell>
        <TableCell className={classes.clipDuration}>
          {formatClipDuration(clip.end_time - clip.start_time)}
        </TableCell>
        <TableCell className={classes.clipCreationTime}>
          {fecha.format(clip.create_time, formatMask)}
        </TableCell>
        <TableCell>
          {status}
        </TableCell>
      </TableRow>
    );
  }

  render() {
    const { classes, clips: real, dispatch, dongleId } = this.props;
    const { copiedPopover, errorPopper } = this.state;

    console.log(real);

    const clips = [
      {
        clip_id: '66acc12bed254e9598468c74ebe6af15',
        dongle_id: '62241b0c7fea4589',
        create_time: 1667944360,
        route_name: '62241b0c7fea4589|2022-11-05--23-05-11',
        start_time: 1667755789103,
        end_time: 1667755999999,
        status: 'pending',
        title: null,
        video_type: 'e',
        is_public: false,
      },
      {
        clip_id: '66acc12bed254e9598468c74ebe6af14',
        dongle_id: '62241b0c7fea4589',
        create_time: 1667944360,
        route_name: '62241b0c7fea4589|2022-11-05--23-05-11',
        start_time: 1667714789103,
        end_time: 1667714879356,
        status: 'failed',
        title: null,
        video_type: 'e',
        is_public: false,
      },
      {
        clip_id: 'a99687ba9c2d4e808d4419f360352f4d',
        dongle_id: '62241b0c7fea4589',
        create_time: 1667944171,
        route_name: '62241b0c7fea4589|2022-11-05--22-48-32',
        start_time: 1667714240806,
        end_time: 1667714268667,
        status: 'done',
        title: null,
        video_type: 'f',
        is_public: false,
        thumbnail: 'https://chffrprivate.blob.core.windows.net/clips/62241b0c7fea4589/2022-11-05--22-48-32_a99687ba9c2d4e808d4419f360352f4d_thumbnail.jpg?se=2022-11-16T19%3A32%3A26Z&sp=r&sv=2018-03-28&sr=b&rscd=attachment%3B%20filename%3D2022-11-05--22-48-32_a99687ba9c2d4e808d4419f360352f4d_thumbnail.jpg&sig=ZRor6MpC671JDzBzvcvYec3hjmwIWMuQDVKgTL1Sxio%3D',
      },
      {
        clip_id: 'e4d91b3e041d47fbbc4129bbece532c9',
        dongle_id: '62241b0c7fea4589',
        create_time: 1666751146,
        route_name: '62241b0c7fea4589|2022-10-25--18-52-09',
        start_time: 1666750233803,
        end_time: 1666750256171,
        status: 'done',
        title: 'man',
        video_type: 'f',
        is_public: false,
        thumbnail: 'https://chffrprivate.blob.core.windows.net/clips/62241b0c7fea4589/2022-10-25--18-52-09_e4d91b3e041d47fbbc4129bbece532c9_thumbnail.jpg?se=2022-11-16T19%3A32%3A26Z&sp=r&sv=2018-03-28&sr=b&rscd=attachment%3B%20filename%3D2022-10-25--18-52-09_e4d91b3e041d47fbbc4129bbece532c9_thumbnail.jpg&sig=A6oHL73dw4VwWNFpCcNXg9fRzGeYmydjNkHVw4T9eSA%3D',
      },
      {
        clip_id: 'd5f82c74080e4e389f80c9fd3aab8ebd',
        dongle_id: '62241b0c7fea4589',
        create_time: 1666742559,
        route_name: '62241b0c7fea4589|2022-10-25--15-00-46',
        start_time: 1666737647937,
        end_time: 1666737669622,
        status: 'done',
        title: 'airplane front',
        video_type: 'f',
        is_public: false,
        thumbnail: 'https://chffrprivate.blob.core.windows.net/clips/62241b0c7fea4589/2022-10-25--15-00-46_d5f82c74080e4e389f80c9fd3aab8ebd_thumbnail.jpg?se=2022-11-16T19%3A32%3A26Z&sp=r&sv=2018-03-28&sr=b&rscd=attachment%3B%20filename%3D2022-10-25--15-00-46_d5f82c74080e4e389f80c9fd3aab8ebd_thumbnail.jpg&sig=jGbtvoIbc5SugTTPGiNLMl9gfFdpVbHv%2BnJzPMaGbSk%3D',
      },
      {
        clip_id: '62f079f940a64dd984f41c7191173872',
        dongle_id: '62241b0c7fea4589',
        create_time: 1666740380,
        route_name: '62241b0c7fea4589|2022-10-25--15-00-46',
        start_time: 1666737664453,
        end_time: 1666737815106,
        status: 'done',
        title: null,
        video_type: '360',
        is_public: false,
        thumbnail: 'https://chffrprivate.blob.core.windows.net/clips/62241b0c7fea4589/2022-10-25--15-00-46_62f079f940a64dd984f41c7191173872_thumbnail.jpg?se=2022-11-16T19%3A32%3A26Z&sp=r&sv=2018-03-28&sr=b&rscd=attachment%3B%20filename%3D2022-10-25--15-00-46_62f079f940a64dd984f41c7191173872_thumbnail.jpg&sig=iE6A8Ylqk9d3V7L3AuUq14iPMBNoT67scbx3yQJ1f5o%3D',
      },
      {
        clip_id: 'c1221efeea2f42a1ad0b15ec03171fe8',
        dongle_id: '62241b0c7fea4589',
        create_time: 1666740372,
        route_name: '62241b0c7fea4589|2022-10-25--15-00-46',
        start_time: 1666737505506,
        end_time: 1666737742405,
        status: 'done',
        title: null,
        video_type: '360',
        is_public: false,
        thumbnail: 'https://chffrprivate.blob.core.windows.net/clips/62241b0c7fea4589/2022-10-25--15-00-46_c1221efeea2f42a1ad0b15ec03171fe8_thumbnail.jpg?se=2022-11-16T19%3A32%3A26Z&sp=r&sv=2018-03-28&sr=b&rscd=attachment%3B%20filename%3D2022-10-25--15-00-46_c1221efeea2f42a1ad0b15ec03171fe8_thumbnail.jpg&sig=C9PkunyAL0h1g7eqXqFvDtD0II0lhvldIq6MCXOsO1I%3D',
      },
      {
        clip_id: '1e5094ff4c904901a7606cd50ddf72e4',
        dongle_id: '62241b0c7fea4589',
        create_time: 1666740352,
        route_name: '62241b0c7fea4589|2022-10-25--15-00-46',
        start_time: 1666737263079,
        end_time: 1666737506059,
        status: 'done',
        title: null,
        video_type: '360',
        is_public: false,
        thumbnail: 'https://chffrprivate.blob.core.windows.net/clips/62241b0c7fea4589/2022-10-25--15-00-46_1e5094ff4c904901a7606cd50ddf72e4_thumbnail.jpg?se=2022-11-16T19%3A32%3A26Z&sp=r&sv=2018-03-28&sr=b&rscd=attachment%3B%20filename%3D2022-10-25--15-00-46_1e5094ff4c904901a7606cd50ddf72e4_thumbnail.jpg&sig=lbB9GNUaEmTsUaXpeLHJQVLGanK6qdxKHYe/D3JPH2Q%3D',
      },
    ];

    // TODO: render "no clips found" and loading spinner
    return (
      <>
        <VisibilityHandler onVisible={() => dispatch(fetchClipsList(dongleId))} onDongleId />

        <Table>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Name</TableCell>
              <TableCell className={classes.clipDuration}>Duration</TableCell>
              <TableCell className={classes.clipCreationTime}>Created at</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {clips && clips.map(this.renderClipItem)}
          </TableBody>
        </Table>

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
  const { clips, dongleId } = state;
  return {
    // don't show old failed clips
    clips: (clips?.list || []).filter((c) => c.status !== 'failed'
      || (Date.now() / 1000 - c.create_time) < 86400 * 7),
    dongleId,
  };
};

export default connect(mapStateToProps)(withStyles(styles)(ClipList));
