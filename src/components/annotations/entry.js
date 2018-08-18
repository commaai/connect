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
import Tooltip from '@material-ui/core/Tooltip';
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
      backgroundColor: '#16181A',
    },
    heading: {
      fontWeight: 500,
    },
    date: {
      color: theme.palette.grey[100],
      fontWeight: 500,
    },
    pillBody: {
      textAlign: 'center',
    },
    pillText: {
      color: theme.palette.error.main,
      border: '1px solid ' + theme.palette.error.main,
      borderRadius: 15,
      display: 'inline-block',
      fontWeight: 500,
      margin: '0 auto',
      padding: '6px 10px',
    },
    summaryContent: {
      padding: '0px',
      '&>:last-child': {
        padding: '0px'
      }
    },
    formField: {
      alignItems: 'center',
      display: 'flex',
      marginBottom: 12,
      width: '100%',
    },
    formLabel: {
      paddingRight: '24px'
    },
    formLabelText: {
      fontWeight: 500,
      textAlign: 'right',
    },
    select: {
      margin: 0,
      width: '100%',
    },
    placeholder: {
      color: theme.palette.placeholder
    },
    panelActions: {
      justifyContent: 'flex-start',
      paddingBottom: 36,
      paddingLeft: '27%',
      paddingRight: 24,
      paddingTop: 0,
    },
    resolveButton: {
      background: 'linear-gradient(to bottom, rgb(82, 94, 102) 0%, rgb(64, 75, 79) 100%)',
      borderRadius: 30,
      color: '#fff',
      padding: '12px 24px',
    },
    cancelButton: {
      border: '1px solid #272D30',
      borderRadius: 30,
      padding: '12px 24px',
    },
    reasonDetailed: {
      paddingLeft: '30px',
      color: theme.palette.lightGrey[200],
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
            <Grid item xs={ 5 }>
              <Typography className={ this.props.classes.heading }>{ this.getTitle() }</Typography>
            </Grid>
            <Grid item xs={ 3 }>
              <Typography className={ this.props.classes.date }>[{ dateString }]</Typography>
            </Grid>
            <Grid item xs={ 3 } className={ this.props.classes.pillBody }>
              <Typography className={ this.props.classes.pillText }>Disengaged</Typography>
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
                { this.isPlanned() && <MenuItem value={ this.props.event.annotation.data.reason }>{ this.props.event.annotation.data.reason }</MenuItem> }
                <MenuItem value='arbitrary'>I wanted to take over</MenuItem>
                <MenuItem className={ this.props.classes.reasonDetailed } value='different-way'>Go a different way</MenuItem>
                <MenuItem className={ this.props.classes.reasonDetailed } value='lanes'>Change lanes</MenuItem>
                <MenuItem className={ this.props.classes.reasonDetailed } value='too-slow'>Accelerate quicker</MenuItem>
                <MenuItem className={ this.props.classes.reasonDetailed } value='exit'>Take an exit</MenuItem>
                <MenuItem className={ this.props.classes.reasonDetailed } value='stop-light'>Stop at light</MenuItem>
                <MenuItem className={ this.props.classes.reasonDetailed } value='stop-sign'>Stop at sign</MenuItem>

                <MenuItem value='danger'>I needed to take over for safety</MenuItem>
                <MenuItem className={ this.props.classes.reasonDetailed } value='sharp-turn'>Turn too sharp</MenuItem>
                <MenuItem className={ this.props.classes.reasonDetailed } value='bad-lanes'>Lanes misidentified</MenuItem>
                <MenuItem className={ this.props.classes.reasonDetailed } value='bad-lead-car'>Lead car misidentified</MenuItem>

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
        <ExpansionPanelActions className={ this.props.classes.panelActions }>
          <Tooltip title='Grey Panda required to annotate' id="tooltip-annot"
                   disableFocusListener={ this.props.segment.hpgps || this.isPlanned() }
                   disableHoverListener={ this.props.segment.hpgps || this.isPlanned() }>
            <div>
              <Button
                onClick={ this.validate }
                size='small'
                disabled={ this.state.saving || this.isPlanned() || !this.props.segment.hpgps }
                className={ this.props.classes.resolveButton }
                >Resolve Annotation</Button>
            </div>
          </Tooltip>
          <Button
            size='small'
            disabled={ this.state.saving }
            onClick={ this.props.onChange }
            className={ this.props.classes.cancelButton }
          >Cancel</Button>
        </ExpansionPanelActions>
      </ExpansionPanel>
    );
  }
  renderFormLine (label, form) {
    return (
      <div className={ this.props.classes.formField }>
        { this.state.errorElem === label.toLowerCase() ? (
            <Grid item xs={ 12 }>
              <FormHelperText error>
                { this.state.error }
              </FormHelperText>
            </Grid>
          ) : null
        }
        <Grid item xs={ 3 } className={ this.props.classes.formLabel }>
          <Typography className={ this.props.classes.formLabelText }>
            { label }:
          </Typography>
        </Grid>
        <Grid item xs={ 9 } style={{ paddingRight: 40 }}>
          { form }
        </Grid>
      </div>
    );
  }
  getTitle () {
    // this.props.event
    if (this.isPlanned()) {
      return 'Planned disengagement';
    } else if (this.props.event.type === 'disengage_steer') {
      return 'Steering disengagement';
    } else if (this.props.event.type === 'disengage') {
      return 'Disengagement';
    }
  }
  isPlanned () {
    return (this.props.event.data && this.props.event.annotation && this.props.event.data.is_planned)
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(AnnotationEntry));
