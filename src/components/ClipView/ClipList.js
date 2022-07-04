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
import { fetchClipsList, navToClips } from '../../actions/clips';
import VisibilityHandler from '../VisibilityHandler';

const styles = (theme) => ({
  clipItemHeader: {
    display: 'flex',
    alignItems: 'center',
    color: Colors.white,
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
  },
  noClips: {
    color: Colors.white,
    fontSize: '1rem',
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
    const { classes, clips } = this.props;
    const { windowWidth } = this.state;

    const viewerPadding = windowWidth < 768 ? 12 : 32;

    const gridWidths = windowWidth < 768 ?
      [7, 66, 20, 7] :
      [7, 66, 20, 7];
    const gridStyles = gridWidths.map((w) => ({ maxWidth: `${w}%`, flexBasis: `${w}%` }));

    const itemStyle = windowWidth < 768 ? { fontSize: '0.8rem' } : { fontSize: '1rem' };

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
            <h6 style={{ ...itemStyle, ...gridStyles[1] }}>title</h6>
            <h6 style={{ ...itemStyle, ...gridStyles[2], textAlign: 'center' }}>date</h6>
            <h6 style={{ ...itemStyle, ...gridStyles[3] }}></h6>
          </div>
        }
        { clips.list && clips.list.map((c) => this.renderClipItem(gridStyles, c)) }
      </div>
    </>;
  }

  renderClipItem(gridStyles, c) {
    const { classes, dongleId } = this.props;
    const { windowWidth } = this.state;

    const itemStyle = windowWidth < 768 ? { fontSize: '0.8rem' } : { fontSize: '1.0rem' };

    const timeStr = fecha.format(new Date(c.start_time), 'MMM\u00a0D h:mm\u00a0a').toLowerCase();
    const StateIconType = c.status === 'pending' ?
      MoreHorizIcon :
      (c.status === 'failed' ? ErrorOutlineIcon : PlayArrowIcon);
    const IsPublicIconType = c.is_public ? LockOpenIcon : LockOutlineIcon;

    let firstGridItemStyle = {...gridStyles[0]};
    if (c.status === 'failed') {
      firstGridItemStyle = { ...firstGridItemStyle, color: Colors.red300 };
    }

    const innerItem = <>
      <StateIconType className={ classes.clipPlayIcon }
        style={{ ...firstGridItemStyle, fontSize: (windowWidth < 768 ? '1.2rem' : '1.4rem') }} />
      <p style={{ ...itemStyle, ...gridStyles[1] }} className={ classes.clipTitle }>{ c.title }</p>
      <p style={{ ...itemStyle, ...gridStyles[2] }}>{ timeStr }</p>
      <IsPublicIconType style={{ ...gridStyles[3], fontSize: (windowWidth < 768 ? '1.0rem' : '1.2rem') }} />
    </>;

    if (c.status === 'failed') {
      return <div key={c.id} className={classes.clipItem} style={{ padding: (windowWidth < 768 ? 3 : 8) }}>
        { innerItem }
      </div>;
    }

    return (
      <a key={c.id} className={classes.clipItem} href={ `/${dongleId}/clips/${c.id}` }
        onClick={ filterRegularClick(() => this.props.dispatch(navToClips(c.id, c.state))) }
        style={{ padding: (windowWidth < 768 ? 3 : 8) }}>
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
