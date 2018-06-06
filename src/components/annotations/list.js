import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Slide from '@material-ui/core/Slide';
import Typography from '@material-ui/core/Typography';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

import AnnotationEntry from './entry';

const styles = theme => {
  return {
    root: {
    }
  };
};

class AnnotationList extends Component {
  constructor (props) {
    super(props);
    this.renderEntry = this.renderEntry.bind(this);
    this.handleExpanded = this.handleExpanded.bind(this);

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
    const events = (this.props.currentSegment || this.props.nextSegment || {}).events || [];
    return (
      <div className={ this.props.classes.root }>
        { events.map(this.renderEntry) }
        <pre>
          <Typography>
            { JSON.stringify(events, null, 2) }
          </Typography>
        </pre>
      </div>
    );
  }
  renderEntry (event, index) {
    let eventId = event.time + ':' + index;
    return (
      <ExpansionPanel key={ eventId } expanded={ this.state.expanded === eventId } onChange={ partial(this.handleExpanded, eventId) } >
        <ExpansionPanelSummary expandIcon={<ExpandMoreIcon />}>
          <Typography className={ this.props.classes.heading }>General settings</Typography>
          <Typography className={ this.props.classes.secondaryHeading }>I am an expansion panel</Typography>
        </ExpansionPanelSummary>
      </ExpansionPanel>
    );
  }
}

const stateToProps = Obstruction({
  currentSegment: 'workerState.currentSegment',
  nextSegment: 'workerState.nextSegment'
});

export default connect(stateToProps)(withStyles(styles)(AnnotationList));
