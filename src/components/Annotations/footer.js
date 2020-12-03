import React, { Component } from 'react';
import Obstruction from 'obstruction';
import { classNames } from 'react-extras';
import PropTypes from 'prop-types';
import document from 'global/document';
import { timeout } from 'thyming';
import { partial } from 'ap';
import raf from 'raf';
import qs from 'querystringify';
import { withStyles } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import Snackbar from '@material-ui/core/Snackbar';

import { raw as RawApi } from '@commaai/comma-api';
import TimelineWorker from '../../timeline';
import * as Demo from '../../demo';
const demoFiles = require('../../demo/files.json');

const styles = (theme) => ({
  root: {
    width: '100%',
    height: '100%',
    paddingTop: theme.spacing.unit,
    background: 'transparent',
    textAlign: 'right'
  },
  footerButton: {
    display: 'inline-block',
    border: `1px solid ${theme.palette.grey[800]}`,
    color: theme.palette.grey[50],
    textDecoration: 'none',
    borderRadius: 20,
    padding: '10px 20px',
    margin: '0px 10px',
    cursor: 'pointer'
  }
});

class AnnotationsFooter extends Component {
  constructor(props) {
    super(props);

    this.copySegmentName = this.copySegmentName.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.downloadSegmentFile = this.downloadSegmentFile.bind(this);
    this.openInCabana = this.openInCabana.bind(this);

    this.state = {
      showCopiedSnack: false,
    };
  }

  copySegmentName(e) {
    const { segment } = this.props;
    if (!segment) {
      return;
    }
    const el = document.createElement('textarea');
    el.value = `${segment.route}--${segment.segment}`;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);

    this.setState({
      showCopiedSnack: true
    });
    this.snackTimer = timeout(this.handleClose, 1000);
  }

  async downloadSegmentFile(type) {
    if (!this.props.segment) {
      return;
    }

    const seg = this.props.segment;
    const segmentKeyPath = `${seg.route.replace('|', '/')}/${seg.segment}`;

    let files;
    if (Demo.isDemo()) {
      files = demoFiles;
    } else {
      files = (await RawApi.getRouteFiles(this.props.segment.route));
    }
    const url = files[type].find((url) => url.indexOf(segmentKeyPath) !== -1);

    if (url) {
      window.location.href = url;
    }
  }

  handleClose() {
    this.setState({
      showCopiedSnack: false
    });
    this.snackTimer();
  }

  openInCabana() {
    const { segment, loop, start } = this.props;
    const currentOffset = TimelineWorker.currentOffset();
    const params = {
      route: segment.route,
      url: segment.url,
      seekTime: Math.floor((currentOffset - segment.routeOffset) / 1000)
    };
    const routeStartTime = (start + segment.routeOffset);

    if (loop.startTime && loop.startTime > routeStartTime && loop.duration < 180000) {
      const startTime = Math.floor((loop.startTime - routeStartTime) / 1000);
      params.segments = [startTime, Math.floor(startTime + (loop.duration / 1000))].join(',');
    }

    const win = window.open(`https://my.comma.ai/cabana/${qs.stringify(params, true)}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  render() {
    return (
      <Paper className={this.props.classes.root}>
        { this.props.segment && this.props.segment.hasVideo
          && (
          <a className={this.props.classes.footerButton} onClick={partial(this.downloadSegmentFile, 'cameras')}>
            Download Camera Segment
          </a>
          )}
        { this.props.segment && this.props.segment.hasDriverCamera
          && (
          <a className={this.props.classes.footerButton} onClick={partial(this.downloadSegmentFile, 'dcameras')}>
            Download Front Camera Segment
          </a>
          )}
        { this.props.segment
          && (
          <a className={this.props.classes.footerButton} onClick={partial(this.downloadSegmentFile, 'logs')}>
            Download Log Segment
          </a>
          )}
        <a className={classNames(this.props.classes.footerButton, 'openInCabana')} onClick={this.openInCabana} href="#">
          View CAN Data in Cabana
        </a>
        <a className={this.props.classes.footerButton} onClick={this.copySegmentName} target="_blank">
          Copy Current Segment
        </a>
        <Snackbar
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'center'
          }}
          open={this.state.showCopiedSnack}
          onClose={this.handleClose}
          ContentProps={{
            'aria-describedby': 'message-id',
          }}
          variant="success"
          message={<span id="message-id">Copied segment name!</span>}
        />
      </Paper>
    );
  }
}

AnnotationsFooter.propTypes = {
  segment: PropTypes.object.isRequired,
  loop: PropTypes.object.isRequired,
  start: PropTypes.number.isRequired
};

export default withStyles(styles)(AnnotationsFooter);
