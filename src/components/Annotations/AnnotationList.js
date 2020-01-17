import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';
import { withStyles } from '@material-ui/core/styles';
import { AutoSizer, List } from 'react-virtualized';
import memoize from 'memoize-one';

import AnnotationListItem from './AnnotationListItem';
import Timelineworker from '../../timeline';
import { selectRange } from '../../actions';
import { filterEvent } from '../../utils';

const LOOP_DURATION = 10000;

const styles = (theme) => ({
  base: {
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 5,
    overflow: 'hidden'
  }
});

class AnnotationList extends PureComponent {
  constructor(props) {
    super(props);

    this.state = {
      expanded: false
    };
  }

  // TODO: Migrate deprecated lifecycle method
  componentWillReceiveProps(nextProps) {
    if (this.state.expanded) {
      if (nextProps.loop.startTime === null || nextProps.resolved !== this.props.resolved) {
        this.setState({ expanded: false }, () => {
          this.recomputeList();
        });
      }
    }
  }

  list = null

  filter = memoize((resolved, unresolved, list) => list.filter(this.filterEntry));

  recomputeList = () => {
    if (this.list) {
      this.list.recomputeRowHeights();
      this.list.forceUpdateGrid();
    }
  }

  handleExpanded = (eventId, timestamp) => {
    const { zoom } = this.props;
    const isExpanded = this.state.expanded !== eventId && eventId;
    this.setState({
      expanded: isExpanded ? eventId : null
    });

    this.recomputeList();

    if (isExpanded) {
      const loopStartTime = timestamp - LOOP_DURATION / 2;
      const loopEndTime = loopStartTime + LOOP_DURATION;
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

  getEvent(index) {
    const { segment } = this.props;
    const events = (segment || {}).events || [];
    const filteredList = this.filter(this.props.resolved, this.props.unresolved, events);

    return filteredList[index];
  }

  getRowHeight = ({ index }) => {
    const event = this.getEvent(index);

    const eventId = `${event.time}:${index}`;

    const expanded = this.state.expanded === eventId;

    return !expanded ? 64 : 314; // TODO: is 314 safe?
  }

  render() {
    const {
      segment, classes, resolved, unresolved
    } = this.props;
    const events = (segment || {}).events || [];

    return (
      <div className={classes.base} style={{ height: '100%' }}>
        <AutoSizer>
          {({ height, width }) => (
            <List
              ref={(ref) => this.list = ref}
              height={height}
              width={width}
              overscanRowCount={10}
              // noRowsRenderer={this.noRowsRenderer}
              rowCount={this.filter(resolved, unresolved, events).length}
              rowHeight={this.getRowHeight}
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
    const event = this.getEvent(index);
    const eventId = `${event.time}:${index}`;
    return (
      <AnnotationListItem
        key={eventId}
        style={style}
        segment={segment}
        eventId={eventId}
        event={event}
        expanded={this.state.expanded === eventId}
        disabled={!segment.hpgps}
        onChange={partial(this.handleExpanded, eventId, event.timestamp)}
      />
    );
  }
}

const stateToProps = Obstruction({
  start: 'workerState.start',
  loop: 'workerState.loop',
  zoom: 'zoom'
});

export default connect(stateToProps)(withStyles(styles)(AnnotationList));
