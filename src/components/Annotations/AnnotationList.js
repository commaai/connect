import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';
import { withStyles } from '@material-ui/core/styles';
import { AutoSizer, List } from 'react-virtualized';
import memoize from 'memoize-one';

import AnnotationListItem from './AnnotationListItem';
import GreyPandaUpsellRow from './greyPandaUpsell';
import Timelineworker from '../../timeline';
import { selectRange } from '../../actions';
import { filterEvent } from '../../utils';

const LOOP_DURATION = 10000;

const styles = theme => {
  return {
    base: {
      border: '1px solid rgba(255,255,255,0.04)',
      borderRadius: 5,
      overflow: 'hidden'
    }
  };
};

class AnnotationList extends PureComponent {
  constructor (props) {
    super(props);

    this.state = {
      expanded: false
    };
  }
  componentWillReceiveProps(nextProps) {
    if (this.state.expanded && nextProps.loop.startTime === null) {
      this.setState({ expanded: false });
    }
  }

  filter = memoize(
    list => list.filter(this.filterEntry)
  );

  handleExpanded = (eventId, timestamp) => {
    const { zoom } = this.props;
    let isExpanded = this.state.expanded !== eventId && eventId;
    this.setState({
      expanded: isExpanded ? eventId : null
    });
    if (isExpanded) {
      let loopStartTime = timestamp - LOOP_DURATION / 2;
      let loopEndTime = loopStartTime + LOOP_DURATION;
      if (zoom && (loopStartTime < zoom.start || loopEndTime > zoom.end)) {
        this.props.dispatch(selectRange(loopStartTime, loopEndTime));
      } else {
        // 5 seconds before, 5 seconds after...
        Timelineworker.selectLoop(loopStartTime, LOOP_DURATION);
      }
    } else if (zoom && zoom.expanded) {
      Timelineworker.selectLoop(zoom.start, zoom.end - zoom.start);
    }
  }
  render() {
    const { segment, classes, isUpsellDemo, resolved } = this.props;
    const events = (segment || {}).events || [];

    return (
      <div className={classes.base} style={{ height: '100%' }}>
        {!(segment.hpgps || isUpsellDemo || resolved) && <GreyPandaUpsellRow />}
        <AutoSizer>
          {({ height, width }) => (
            <List
              height={height}
              width={width}
              overscanRowCount={10}
              // noRowsRenderer={this.noRowsRenderer}
              rowCount={this.filter(events).length}
              rowHeight={64}
              rowRenderer={this.renderEntry}
            />
          )}
        </AutoSizer>
      </div>
    );
  }
  filterEntry = (event) => {
    if (this.props.resolved && !event.id) {
      return false;
    }
    if (this.props.unresolved && event.id) {
      return false;
    }
    return filterEvent(event);
  }

  renderEntry = ({ index, key, style }) => {
    const { segment } = this.props;
    const events = (segment || {}).events || [];
    const filteredList = this.filter(events);

    const event = filteredList[index];
    const eventId = event.time + ':' + index;
    return (
      <AnnotationListItem
        key={key}
        style={style}
        segment={segment}
        eventId={eventId}
        event={event}
        expanded={this.state.expanded === eventId}
        disabled={!segment.hpgps}
        // expanded={ this.state.expanded ? this.state.expanded === eventId : index === 0 }
        onChange={partial(this.handleExpanded, eventId, event.timestamp)}
      />
    )
  }
}

const stateToProps = Obstruction({
  start: 'workerState.start',
  loop: 'workerState.loop',
  zoom: 'zoom'
});

export default connect(stateToProps)(withStyles(styles)(AnnotationList));
