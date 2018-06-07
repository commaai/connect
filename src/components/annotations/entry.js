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
import ExpansionPanelActions from '@material-ui/core/ExpansionPanelActions';
import Divider from '@material-ui/core/Divider';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';

import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

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
      borderRadius: theme.spacing.unit,
      minWidth: '100%',
      fontSize: '0.9em'
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
    }
  };
};

class AnnotationEntry extends Component {
  constructor (props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);

    this.state = {
      reason: ''
    };
  }

  handleChange (e) {
    this.setState({
      reason: e.target.value
    });
  }

  render () {
    const dateString = fecha.format(new Date(this.props.timestamp), 'MMM D @ HH:mm:ss');

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
          <Grid container>
            <Grid item xs={ 1 }>
            </Grid>
            <Grid item xs={ 5 }>
              <Typography className={ this.props.classes.heading }>{ this.getTitle() }</Typography>
            </Grid>
            <Grid item xs={ 4 }>
              <Typography className={ this.props.classes.date }>[{ dateString }]</Typography>
            </Grid>
            <Grid item xs={ 2 }>
              <Typography className={ this.props.classes.disengage }>Disengage</Typography>
            </Grid>
          </Grid>
        </ExpansionPanelSummary>
        <Divider />
        <ExpansionPanelDetails>
          <Grid container alignContent='center' alignItems='center'>
            { this.renderFormLine('Reason', (
              <Select
                displayEmpty
                value={ this.state.reason }
                onChange={ this.handleChange }
                className={ this.props.classes.select }
                inputProps={{
                  name: 'reason',
                  id: 'reason-simple'
                }}
              >
                { this.state.reason === '' &&
                  <MenuItem disabled value=''>
                    Choose one
                  </MenuItem>
                }
                <MenuItem value='accident'>Accidental or unimportant</MenuItem>
                <MenuItem value='intentional'>I wanted to take over</MenuItem>
                <MenuItem value='danger'>I needed to take over for safety</MenuItem>
                <MenuItem value='drunk'>I was severely intoxicated</MenuItem>
                <MenuItem value='aliens'>Avoiding alien invasion</MenuItem>
                <MenuItem value='demons'>Demonic influence</MenuItem>
                <MenuItem value='other'>Other (explain in comment)</MenuItem>
              </Select>
            ))}
            { this.renderFormLine('Comment', (
              <TextField placeholder='Add a comment...' className={ this.props.classes.select } />
            ))}
          </Grid>
        </ExpansionPanelDetails>
        <ExpansionPanelActions>
          <Button variant='outlined' size='small'>Resolve Annotation</Button>
          <Button variant='outlined' size='small'>Cancel</Button>
        </ExpansionPanelActions>
      </ExpansionPanel>
    );
  }
  renderFormLine (label, form) {
    return (
      <React.Fragment>
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
