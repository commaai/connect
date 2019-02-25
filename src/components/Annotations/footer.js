import React, { Component } from 'react';
import Obstruction from 'obstruction';
import PropTypes from 'prop-types';
import document from 'global/document';
import { timeout } from 'thyming';
import { partial } from 'ap';
import raf from 'raf';
import { withStyles } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import Snackbar from '@material-ui/core/Snackbar';

import * as API from '../../api';
import TimelineWorker from '../../timeline';

const styles = theme => {
  return {
    root: {
      width: '100%',
      height: '100%',
      paddingTop: theme.spacing.unit,
      background: 'transparent',
      textAlign: 'right'
    },
    footerButton: {
      display: 'inline-block',
      border: '1px solid ' + theme.palette.grey[800],
      color: theme.palette.grey[50],
      textDecoration: 'none',
      borderRadius: 20,
      padding: '10px 20px',
      margin: '0px 10px',
      cursor: 'pointer'
    }
  }
};

class AnnotationsFooter extends Component {
  static propTypes = {
    segment: PropTypes.object.isRequired,
  };

  constructor (props) {
    super(props);

    this.copySegmentName = this.copySegmentName.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.downloadSegmentFile = this.downloadSegmentFile.bind(this);
    this.openInCabana = this.openInCabana.bind(this);
    this.openWayInOsmEditor = this.openWayInOsmEditor.bind(this);
    this.updateWayId = this.updateWayId.bind(this);

    this.state = {
      showCopiedSnack: false,
      wayId: 0,
    }
  }

  componentDidMount() {
    raf(this.updateWayId);
  }

  updateWayId() {
    raf(this.updateWayId);

    var event = TimelineWorker.currentLiveMapData();
    if (event && event.LiveMapData) {
      var wayId = parseInt(event.LiveMapData.WayId);
      if (wayId !== this.state.wayId) {
        this.setState({ wayId });
      }
    } else if (this.state.wayId) {
      this.setState({ wayId: 0 });
    }
  }

  copySegmentName (e) {
    const el = document.createElement('textarea');
    el.value = this.props.segment.route + '--' + this.props.segment.segment;
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

    let seg = this.props.segment;
    let segmentKeyPath = seg.route.replace('|', '/') + '/' + seg.segment;

    let files = (await API.getRouteFiles(this.props.segment.route));
    let url = files[type].find(function(url) {
      return url.indexOf(segmentKeyPath) !== -1;
    })

    if (url) {
      window.location.href = url;
    }
  }

  handleClose () {
    this.setState({
      showCopiedSnack: false
    });
    this.snackTimer();
  }

  openInCabana () {
    var win = window.open('https://community.comma.ai/cabana/?route=' + this.props.segment.route + '&seekTime=' + Math.floor((TimelineWorker.currentOffset() - this.props.segment.routeOffset) / 1000), '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  openWayInOsmEditor () {
    var { wayId } = this.state;
    if (!wayId) {
      return;
    }

    var win = window.open(`https://www.openstreetmap.org/way/${wayId}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  render () {
    return (
      <Paper className={ this.props.classes.root } >
        { this.props.segment && this.props.segment.hasVideo &&
          <a className={ this.props.classes.footerButton } onClick={ partial(this.downloadSegmentFile, 'cameras') }>
            Download Camera Segment
          </a>
        }
        { this.props.segment && this.props.segment.hasDriverCamera &&
          <a className={ this.props.classes.footerButton } onClick={ partial(this.downloadSegmentFile, 'dcameras') }>
            Download Front Camera Segment
          </a>
        }
        { this.props.segment &&
          <a className={ this.props.classes.footerButton } onClick={ partial(this.downloadSegmentFile, 'logs') }>
            Download Log Segment
          </a>
        }
        <a className={ this.props.classes.footerButton } onClick={ this.openWayInOsmEditor } href='#'>
          Edit OpenStreetMap Here
        </a>
        <a className={ this.props.classes.footerButton } onClick={ this.openInCabana } href='#'>
          Open in Cabana
        </a>
        <a className={ this.props.classes.footerButton } onClick={ this.copySegmentName } target='_blank'>
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

export default withStyles(styles)(AnnotationsFooter);
