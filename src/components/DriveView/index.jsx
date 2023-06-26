import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';

import Typography from '@material-ui/core/Typography';

import { selectRange } from '../../actions';
import { filterRegularClick } from '../../utils';
import ConnectWindow from '../ConnectWindow';
import ResizeHandler from '../ResizeHandler';
import Timeline from '../Timeline';
import Media from './Media';

class DriveView extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
    };

    this.close = this.close.bind(this);
    this.onResize = this.onResize.bind(this);
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  close() {
    this.props.dispatch(selectRange(null, null));
  }

  render() {
    const { zoom, routes } = this.props;
    const { windowWidth } = this.state;

    const viewEndTime = fecha.format(new Date(zoom.end), 'HH:mm');
    const startTime = fecha.format(new Date(zoom.start), 'MMM D @ HH:mm');
    let headerText = `${startTime} - ${viewEndTime}`;
    if (windowWidth >= 640) {
      const startDay = fecha.format(new Date(zoom.start), 'dddd');
      headerText = `${startDay} ${headerText}`;
    }

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <ConnectWindow
          title={headerText}
          onBack={() => window.history.back()}
          onClose={() => filterRegularClick(this.close)}
        >
          <Timeline thumbnailsVisible hasRuler />
          <div className="p-3 md:p-8">
            { (routes && routes.length === 0)
              ? <Typography>Route does not exist.</Typography>
              : <Media /> }
          </div>
        </ConnectWindow>
      </>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  routes: 'routes',
  zoom: 'zoom',
});

export default connect(stateToProps)(DriveView);
