import React, { Component } from 'react';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Slide from '@material-ui/core/Slide';
import Typography from '@material-ui/core/Typography';

import AnnotationEntry from './entry';
import Timelineworker from '../../timeline';
import { filterEvent } from './common';

const styles = theme => {
  return {
    root: {
      border: '1px solid rgba(255,255,255,0.04)',
      borderRadius: 5,
      overflow: 'hidden'
    }
  };
};

class AnnotationList extends Component {
  constructor (props) {
    super(props);
    this.renderEntry = this.renderEntry.bind(this);
    this.handleExpanded = this.handleExpanded.bind(this);
    this.filterEntry = this.filterEntry.bind(this);

    this.state = {
      expanded: false
    };
  }

  handleExpanded (eventId, seekpos) {
    this.setState({
      expanded: this.state.expanded === eventId ? null : eventId
    });

    Timelineworker.seek(seekpos - 10000);
  }

  render() {
    // you like that line? mmm, so unclear.
    // use current segment or next segment or empty defaults so it doesn't throw
    const segment = this.props.segment;
    const events = (segment || {}).events || [];
    return (
      <div className={ this.props.classes.root }>
        { events.filter(this.filterEntry).map(partial(this.renderEntry, segment)) }
      </div>
    );
  }
  filterEntry (event) {
    if (this.props.resolved && !event.id) {
      return false;
    }
    if (this.props.unresolved && event.id) {
      return false;
    }
    return filterEvent(event);
  }
  renderEntry (segment, event, index) {
    const eventId = event.time + ':' + index;

    return (
      <AnnotationEntry
        key={ eventId }
        segment={ segment }
        eventId={ eventId }
        event={ event }
        expanded={ this.state.expanded === eventId }
        // expanded={ this.state.expanded ? this.state.expanded === eventId : index === 0 }
        onChange={ partial(this.handleExpanded, eventId, segment.routeOffset + event.route_offset_millis) }
        />
    );
  }
  eventTitle (event) {
    return 'Disengage event';
  }
}

export default withStyles(styles)(AnnotationList);
