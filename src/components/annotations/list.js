import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Slide from '@material-ui/core/Slide';
import Typography from '@material-ui/core/Typography';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

const styles = theme => {
  return {
    root: {
    },
    entry: {
      backgroundColor: theme.palette.grey[800]
    },
    expanded: {
      margin: '0px 0',
      backgroundColor: theme.palette.grey[999]
    },
    date: {
      color: theme.palette.grey[100]
    },
    disengage: {
      textAlign: 'center',
      verticalAlign: 'middle',
      lineHeight: '17px',
      color: theme.palette.error.main,
      border: '1px solid ' + theme.palette.error.main,
      borderRadius: theme.spacing.unit,
      minWidth: '100%',
      fontSize: '0.9em'
    },
    summaryContent: {
      padding: '0px',
      '&>:last-child': {
        padding: '0px'
      }
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

  handleExpanded (eventId) {
    this.setState({
      expanded: this.state.expanded === eventId ? null : eventId
    });
  }

  render() {
    // you like that line? mmm, so unclear.
    // use current segment or next segment or empty defaults so it doesn't throw
    const segment = this.props.currentSegment || this.props.nextSegment;
    const events = (segment || {}).events || [];
    return (
      <div className={ this.props.classes.root }>
        { events.filter(this.filterEntry).map(partial(this.renderEntry, segment)) }
        <pre>
          <Typography>
            { JSON.stringify({}, null, 2) }
          </Typography>
        </pre>
      </div>
    );
  }
  filterEntry (entry) {
    return entry.type === 'disengage';
  }
  renderEntry (segment, event, index) {
    const eventId = event.time + ':' + index;
    const timestamp = this.props.start + segment.startOffset + event.offset_millis;
    const dateString = fecha.format(new Date(timestamp), 'MMM D @ HH:mm:ss');

    return (
      <ExpansionPanel
        classes={{
          expanded: this.props.classes.expanded
        }}
        className={ this.props.classes.entry }
        key={ eventId }
        expanded={ this.state.expanded === eventId }
        onChange={ partial(this.handleExpanded, eventId) }
        >
        <ExpansionPanelSummary classes={{
            content: this.props.classes.summaryContent
          }}>
          <Grid container>
            <Grid item xs={ 1 }>
            </Grid>
            <Grid item xs={ 5 }>
              <Typography className={ this.props.classes.heading }>{ this.eventTitle(event) }</Typography>
            </Grid>
            <Grid item xs={ 4 }>
              <Typography className={ this.props.classes.date }>[{ dateString }]</Typography>
            </Grid>
            <Grid item xs={ 2 }>
              <Typography className={ this.props.classes.disengage }>Disengage</Typography>
            </Grid>
          </Grid>
        </ExpansionPanelSummary>
        <ExpansionPanelDetails>
          details and stuff!
        </ExpansionPanelDetails>
      </ExpansionPanel>
    );
  }
  eventTitle (event) {
    return 'Disengage event';
  }
}

const stateToProps = Obstruction({
  currentSegment: 'workerState.currentSegment',
  nextSegment: 'workerState.nextSegment',
  start: 'workerState.start'
});

export default connect(stateToProps)(withStyles(styles)(AnnotationList));
