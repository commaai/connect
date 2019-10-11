import React, { PureComponent } from 'react';
import fecha from 'fecha';
import Raven from 'raven-js';
import { classNames } from 'react-extras';

import {
  withStyles,
  Grid,
  Typography,
  ExpansionPanel,
  ExpansionPanelSummary,
  ExpansionPanelDetails,
  ExpansionPanelActions,
  Divider,
  Select,
  MenuItem,
  Button,
  TextField,
  Tooltip,
  FormHelperText,
  LinearProgress,
} from '@material-ui/core';

import { annotations as Annotations } from '@commaai/comma-api';
import Timelineworker from '../../timeline';

const DISENGAGEMENT_REASONS = [
  { value: 'arbitrary', title: 'I wanted to take over', header: true },
  { value: 'different-way', title: 'Go a different way' },
  { value: 'lanes', title: 'Change lanes' },
  { value: 'too-slow', title: 'Accelerate quicker' },
  { value: 'exit', title: 'Take an exit' },
  { value: 'stop-light', title: 'Stop at light' },
  { value: 'stop-sign', title: 'Stop at sign' },
  { value: 'other-desire', title: 'Other (explain in comment)' },

  { value: 'danger', title: 'I needed to take over for safety', header: true },
  { value: 'sharp-turn', title: 'Turn too sharp' },
  { value: 'bad-lanes', title: 'Lanes misidentified' },
  { value: 'bad-lead-car', title: 'Lead car misidentified' },
  { value: 'other-safety', title: 'Other (explain in comment)' },
];

const styles = (theme) => ({
  base: {
    backgroundColor: '#272D30',
  },
  isExpanded: {
    minHeight: 'initial',
    margin: '0px 0',
    backgroundColor: '#1D2225',
  },
  bubble: {
    background: 'linear-gradient(to bottom, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.55) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 60,
    height: 28,
    width: 28,
  },
  heading: {
    fontWeight: 500,
    paddingLeft: '5%',
  },
  date: {
    color: theme.palette.grey[100],
    fontWeight: 500,
  },
  pillBody: {
    textAlign: 'center',
  },
  pillText: {
    color: '#65737a',
    border: '1px solid #65737a57',
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
    textTransform: 'none',
  },
  cancelButton: {
    background: 'transparent',
    border: '1px solid #272D30',
    borderRadius: 30,
    padding: '12px 24px',
    textTransform: 'none',
  },
  reasonDetailed: {
    paddingLeft: '30px',
    color: theme.palette.lightGrey[200],
  }
});

class AnnotationEntry extends PureComponent {
  constructor(props) {
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

  componentWillReceiveProps(props) {
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

  handleChange(e) {
    this.setState({
      reason: e.target.value
    });
  }

  handleComment(e) {
    this.setState({
      comment: e.target.value
    });
  }

  async validate() {
    const { event, segment } = this.props;
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

    let data = null;

    try {
      if (!this.state.id) {
        data = await Annotations.createAnnotation({
          canonical_segment_name: event.canonical_segment_name,
          offset_nanos_part: event.offset_nanos,
          offset_millis: event.offset_millis,
          start_time_utc_millis: event.timestamp,
          end_time_utc_millis: event.timestamp,
          type: event.type,
          data: {
            reason: this.state.reason,
            comment: this.state.comment
          }
        });
        Timelineworker.resolveAnnotation(data, event, segment.route);
      } else {
        data = await Annotations.updateAnnotation(this.state.id, {
          reason: this.state.reason,
          comment: this.state.comment
        });
      }

      Timelineworker.selectLoop(null, null);
    } catch (e) {
      Raven.captureException(e);
      // no error
      const error = e;
      const { message } = error;
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

    this.setState({
      id: data.id,
      error: false,
      errorElem: false,
      saving: false
    });
  }

  render() {
    const {
      event, eventId, segment, classes, style
    } = this.props;
    const dateString = fecha.format(new Date(event.timestamp), 'MMM D @ HH:mm:ss');
    const reason = this.state.reason || '';
    const comment = this.state.comment || '';
    let selectClassName = this.props.classes.select;
    if (!reason.length) {
      selectClassName += ` ${this.props.classes.placeholder}`;
    }

    return (
      <ExpansionPanel
        style={style}
        classes={{ expanded: classes.isExpanded }}
        className={classNames(classes.base, 'AnnotationListEntry')}
        key={eventId}
        expanded={this.props.expanded}
        onChange={this.props.onChange}
        defaultExpanded={this.props.defaultExpanded}
      >
        <ExpansionPanelSummary
          classes={{ content: classes.summaryContent }}
        >
          <Grid container alignItems="center">
            <Grid item xs={1}>
              <div className={classes.bubble} />
            </Grid>
            <Grid item xs={5}>
              <Typography className={classes.heading}>
                { this.getTitle() }
              </Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography className={classes.date}>
                [
                { dateString }
]
              </Typography>
            </Grid>
            <Grid item xs={3} className={classes.pillBody}>
              <Typography className={classes.pillText}>
                Disengaged
              </Typography>
            </Grid>
          </Grid>
        </ExpansionPanelSummary>
        { !this.state.saving && <Divider style={{ marginBottom: 4 }} /> }
        { this.state.saving && <LinearProgress /> }
        <ExpansionPanelDetails>
          <Grid container alignContent="center" alignItems="center">
            { this.renderFormField('Reason', (
              <Select
                disabled={this.state.saving}
                displayEmpty
                error={this.state.errorElem === 'reason'}
                value={reason}
                onChange={this.handleChange}
                className={selectClassName}
                inputProps={{ name: 'reason', id: 'reason-simple' }}
              >
                { reason === ''
                  && (
                  <MenuItem disabled value="">
                    Choose one
                  </MenuItem>
                  )}
                { this.isPlanned()
                  && (
                  <MenuItem value={event.annotation.data.reason}>
                    { event.annotation.data.reason }
                  </MenuItem>
                  )}
                { DISENGAGEMENT_REASONS.map((disengagementReason) => (
                  <MenuItem
                    key={disengagementReason.value}
                    value={disengagementReason.value}
                    className={!disengagementReason.header ? this.props.classes.reasonDetailed : ''}
                  >
                    { disengagementReason.title }
                  </MenuItem>
                ))}
              </Select>
            ))}
            { this.renderFormField('Comment', (
              <TextField
                onChange={this.handleComment}
                placeholder="Add a comment..."
                className={classes.select}
                error={this.state.errorElem === 'Comment'}
                disabled={this.state.saving}
                value={comment}
              />
            ))}
          </Grid>
        </ExpansionPanelDetails>
        <ExpansionPanelActions className={classes.panelActions}>
          <Tooltip
            id="tooltip-annot"
            title="Grey Panda required to annotate"
            disableFocusListener={segment.hpgps || this.isPlanned()}
            disableHoverListener={segment.hpgps || this.isPlanned()}
          >
            <div>
              <Button
                onClick={this.validate}
                size="large"
                disabled={this.state.saving || this.isPlanned() || !segment.hpgps}
                className={classes.resolveButton}
              >
                Resolve Annotation
              </Button>
            </div>
          </Tooltip>
          <Button
            size="large"
            disabled={this.state.saving}
            onClick={this.props.onChange}
            className={classes.cancelButton}
          >
            Cancel
          </Button>
        </ExpansionPanelActions>
      </ExpansionPanel>
    );
  }

  renderFormField(label, form) {
    const { classes } = this.props;
    return (
      <div className={classes.formField}>
        { this.state.errorElem === label.toLowerCase() && (
        <Grid item xs={12}>
          <FormHelperText error>
            { this.state.error }
          </FormHelperText>
        </Grid>
        )}
        <Grid item xs={3} className={classes.formLabel}>
          <Typography className={classes.formLabelText}>
            { label }
:
          </Typography>
        </Grid>
        <Grid item xs={9} style={{ paddingRight: 40 }}>
          { form }
        </Grid>
      </div>
    );
  }

  getTitle() {
    if (this.isPlanned()) {
      return 'Planned Disengagement';
    } if (this.props.event.type === 'disengage_steer') {
      return 'Steering Override';
    } if (this.props.event.type === 'disengage') {
      return 'Disengagement';
    }
  }

  isPlanned() {
    const { event } = this.props;
    return (event.data && event.annotation && event.data.is_planned);
  }
}

export default withStyles(styles)(AnnotationEntry);
