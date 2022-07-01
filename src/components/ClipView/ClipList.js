import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';

import { withStyles, CircularProgress } from '@material-ui/core';
import LockOutlineIcon from '@material-ui/icons/LockOutline';
import LockOpenIcon from '@material-ui/icons/LockOpen';
import PlayArrowIcon from '@material-ui/icons/PlayCircleOutline';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';

import { filterRegularClick } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { navToClips } from '../../actions/clips';

const styles = (theme) => ({
  clipItemHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: 3,
    color: Colors.white,
    '& h6': {
      padding: '0 3px',
      fontSize: '0.8rem',
      margin: 0,
    },
  },
  clipItem: {
    display: 'flex',
    alignItems: 'center',
    padding: 3,
    color: Colors.white,
    borderTop: '1px solid rgba(255, 255, 255, .05)',
    textDecoration: 'none',
    '&:hover': {},
    '& p': {
      padding: '0 3px',
      fontSize: '0.8rem',
      margin: 0,
      textAlign: 'center',
    },
  },
  clipPublicIcon: {
    fontSize: '1rem',
  },
  clipTitle: {
    'p&': {
      textAlign: 'left',
    }
  },
  clipPlayIcon: {
    fontSize: '1.2rem',
    paddingRight: 3,
  },
});

class ClipList extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
    };

    this.onResize = this.onResize.bind(this);
    this.renderClipItem = this.renderClipItem.bind(this);
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes, device, clips } = this.props;
    const { windowWidth } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    const gridWidths = windowWidth < 768 ?
      [7, 66, 20, 7] :
      [7, 66, 20, 7];
    const gridStyles = gridWidths.map((w) => ({ maxWidth: `${w}%`, flexBasis: `${w}%` }));

    return <>
      <ResizeHandler onResize={ this.onResize } />

      <div style={{ padding: viewerPadding }}>
        { !clips.list && <CircularProgress style={{ margin: 12, color: Colors.white }} size={ 20 } /> }
        { Boolean(clips.list && clips.list.length === 0) && <p>no clips found</p> }
        { Boolean(clips.list && clips.list.length > 0) &&
          <div className={classes.clipItemHeader}>
            <h6 style={ gridStyles[0] }></h6>
            <h6 style={ gridStyles[1] }>title</h6>
            <h6 style={{ ...gridStyles[2], textAlign: 'center' }}>date</h6>
            <h6 style={ gridStyles[3] }></h6>
          </div>
        }
        { clips.list && clips.list.map((c) => this.renderClipItem(gridStyles, c)) }
      </div>
    </>;
  }

  renderClipItem(gridStyles, c) {
    const { classes, dongleId } = this.props;

    const timeStr = fecha.format(new Date(c.start_time), 'MMM\u00a0D h:mm\u00a0a').toLowerCase();
    const StateIconType = c.status === 'pending' ?
      MoreHorizIcon :
      (c.status === 'failed' ? ErrorOutlineIcon : PlayArrowIcon);
    const IsPublicIconType = c.is_public ? LockOpenIcon : LockOutlineIcon;


    if (c.status === 'failed') {
      gridStyles[0] = { ...gridStyles[0], color: Colors.red300 };
    }

    const innerItem = <>
      <StateIconType style={ gridStyles[0] } className={ classes.clipPlayIcon } />
      <p style={ gridStyles[1] } className={ classes.clipTitle }>{ c.title }</p>
      <p style={ gridStyles[2] }>{ timeStr }</p>
      <IsPublicIconType style={ gridStyles[3] } className={ classes.clipPublicIcon } />
    </>;

    if (c.status === 'failed') {
      return <div key={c.id} className={classes.clipItem}>
        { innerItem }
      </div>;
    }

    return (
      <a key={c.id} className={classes.clipItem} href={ `/${dongleId}/clips/${c.id}` }
        onClick={ filterRegularClick(() => this.props.dispatch(navToClips(c.id, c.state))) } >
        { innerItem }
      </a>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
  clips: 'clips',
});

export default connect(stateToProps)(withStyles(styles)(ClipList));
