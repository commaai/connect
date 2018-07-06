import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';
import Raven from 'raven-js';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Slide from '@material-ui/core/Slide';
import Typography from '@material-ui/core/Typography';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import ExpansionPanelActions from '@material-ui/core/ExpansionPanelActions';
import Divider from '@material-ui/core/Divider';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import FormHelperText from '@material-ui/core/FormHelperText';
import LinearProgress from '@material-ui/core/LinearProgress';

import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

import * as API from '../../api';
import Timelineworker from '../../timeline';

const styles = theme => {
  return {
    root: {
      backgroundColor: theme.palette.grey[800]
    },
    expandedd: {
      minHeight: 'initial',
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
      borderRadius: 15,
      fontSize: '0.9em',
      display: 'inline-block',
      padding: '6px 10px'
    },
    summaryContent: {
      padding: '0px',
      '&>:last-child': {
        padding: '0px'
      }
    },
    formLabel: {
      verticalAlign: 'center',
      lineHeight: '42px',
      textAlign: 'right',
      paddingRight: '24px'
    },
    select: {
      width: '100%',
      marginTop: 14,
      '&>div': {
        height: 42
      }
    },
    placeholder: {
      color: theme.palette.placeholder
    }
  };
};

class AnnotationEntry extends Component {
  constructor (props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.handleComment = this.handleComment.bind(this);
    this.validate = this.validate.bind(this);

    if (this.props.event.annotation) {
      this.state = {
        ...this.props.event.annotation.data,
        saving: false,
        id: this.props.event.id
      };
    } else {
      this.state = {
        saving: false
      };
    }
  }

  componentWillReceiveProps (props) {
    if (props.event.annotation) {
      this.setState({
        ...props.event.annotation.data,
        saving: false,
        id: props.event.id
      });
    } else {
      this.setState({
        saving: false
      });
    }
  }

  handleChange (e) {
    this.setState({
      reason: e.target.value
    });
  }

  handleComment (e) {
    this.setState({
      comment: e.target.value
    });
  }

  async validate () {
    if (this.state.saving) {
      return false;
    }
    if (!this.state.reason || this.state.reason === '') {
      this.setState({
        error: 'You must select a reason',
        errorElem: 'reason'
      });
      return;
    }

    if (this.state.reason === 'other' && !this.state.comment.length) {
      this.setState({
        error: 'You must describe your reason',
        errorElem: 'comment'
      });
      return;
    }

    // no error
    this.setState({
      error: false,
      errorElem: false,
      saving: true
    });

    var data = null;

    try {
      if (!this.state.id) {
        data = await API.createAnnotation({
          canonical_segment_name: this.props.event.canonical_segment_name,
          offset_nanos_part: this.props.event.offset_nanos,
          offset_millis: this.props.event.offset_millis,
          start_time_utc_millis: this.props.event.timestamp,
          end_time_utc_millis: this.props.event.timestamp,
          type: this.props.event.type,
          data: {
            reason: this.state.reason,
            comment: this.state.comment
          }
        });
        Timelineworker.resolveAnnotation(data, this.props.event, this.props.segment.route);
      } else {
        data = await API.updateAnnotation(this.state.id, {
          reason: this.state.reason,
          comment: this.state.comment
        });
      }

      Timelineworker.selectLoop(null, null);
    } catch (e) {
      Raven.captureException(e);
      // no error
      let error = e;
      let message = error.message;
      if (!error.isJoi) {
        this.setState({
          error: message,
          errorElem: 'reason',
          saving: false
        });
      } else {
        this.setState({
          error: message,
          errorElem: 'reason',
          saving: false
        });
      }
      return;
    }

    console.log('Hey check out this kickass annotation', data);
    this.setState({
      id: data.id,
      error: false,
      errorElem: false,
      saving: false
    });
  }

  render () {
    const dateString = fecha.format(new Date(this.props.event.timestamp), 'MMM D @ HH:mm:ss');
    const reason = this.state.reason || '';
    const comment = this.state.comment || '';
    var selectClassName = this.props.classes.select;
    if (!reason.length) {
      selectClassName += ' ' + this.props.classes.placeholder;
    }

    return (
      <ExpansionPanel
        classes={{
          expanded: this.props.classes.expandedd
        }}
        className={ this.props.classes.root }
        key={ this.props.eventId }
        expanded={ this.props.expanded }
        onChange={ this.props.onChange }
        defaultExpanded={ this.props.defaultExpanded }
        >
        <ExpansionPanelSummary classes={{
            content: this.props.classes.summaryContent
          }}>
          <Grid container alignItems='center' >
            <Grid item xs={ 1 }>
            </Grid>
            <Grid item xs={ 4 }>
              <Typography className={ this.props.classes.heading }>{ this.getTitle() }</Typography>
            </Grid>
            <Grid item xs={ 4 }>
              <Typography className={ this.props.classes.date }>[{ dateString }]</Typography>
            </Grid>
            <Grid item xs={ 3 }>
              <Typography className={ this.props.classes.disengage }>Disengaged</Typography>
            </Grid>
          </Grid>
        </ExpansionPanelSummary>
        {/* if (!this.state.saving) { */}
        { !this.state.saving && <Divider style={{ marginBottom: 4 }} /> }
        {/* } else { */}
        {  this.state.saving && <LinearProgress /> }
        <ExpansionPanelDetails>
          <Grid container alignContent='center' alignItems='center'>
            { this.renderFormLine('Reason', (
              <Select
                disabled={ this.state.saving }
                displayEmpty
                error={ this.state.errorElem === 'reason' }
                value={ reason }
                onChange={ this.handleChange }
                className={ selectClassName }
                inputProps={{
                  name: 'reason',
                  id: 'reason-simple'
                }}
              >
                { reason === '' &&
                  <MenuItem disabled value='' >
                    Choose one
                  </MenuItem>
                }
                <MenuItem value='arbitrary'>Arbitrary or accidental</MenuItem>
                <MenuItem value='danger'>I needed to take over for safety</MenuItem>
                <MenuItem value='lanes'>Lane change</MenuItem>
                <MenuItem value='aliens'>Go a different way</MenuItem>
                <MenuItem value='sharp-turn'>Turn too sharp</MenuItem>
                <MenuItem value='too-slow'>I wanted to accelerate quicker</MenuItem>
                <MenuItem value='other'>Other (explain in comment)</MenuItem>
              </Select>
            ))}
            { this.renderFormLine('Comment', (
              <TextField
                onChange={ this.handleComment }
                placeholder='Add a comment...'
                className={ this.props.classes.select }
                error={ this.state.errorElem === 'Comment' }
                disabled={ this.state.saving }
                value={ comment }
                />
            ))}
          </Grid>
        </ExpansionPanelDetails>
        <ExpansionPanelActions>
          <Button
            onClick={ this.validate }
            variant='outlined'
            size='small'
            disabled={ this.state.saving }
            >Resolve Annotation</Button>
          <Button
            variant='outlined'
            size='small'
            disabled={ this.state.saving }
            onClick={ this.props.onChange }
          >Cancel</Button>
        </ExpansionPanelActions>
      </ExpansionPanel>
    );
  }
  renderFormLine (label, form) {
    return (
      <React.Fragment>
        <Grid item xs={ 12 }>
          { this.state.errorElem === label.toLowerCase() && <FormHelperText error>{ this.state.error }</FormHelperText> }
        </Grid>
        <Grid item xs={ 3 }>
          <Typography className={ this.props.classes.formLabel } >
            { label }:
          </Typography>
        </Grid>
        <Grid item xs={ 9 } style={{
          paddingRight: 40
        }}>
          { form }
        </Grid>
      </React.Fragment>
    );
  }
  getTitle () {
    // this.props.event
    return 'Disengage event';
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(AnnotationEntry));
