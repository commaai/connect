import React, { Component } from 'react';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Badge from '@material-ui/core/Badge';

import AnnotationList from './AnnotationList';
import { filterEvent } from '../../utils';

const styles = (theme) => ({
  root: {
    height: '100%',
    width: '100%',
  },
  annotationsViewer: {
    display: 'flex',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  annotationsViewerTabs: {
    marginBottom: 12,
    width: '100%',
  },
  tabLabelBadge: {
    backgroundColor: theme.palette.grey[100],
    borderRadius: 24,
    marginRight: 24,
    minWidth: 28,
    top: -4,
  },
  tabLabelText: {
    fontWeight: 500,
    paddingLeft: 24,
    textTransform: 'none',
  },
  annotationsViewerTabIndicator: {
    backgroundColor: theme.palette.grey[100],
    borderRadius: 8,
    height: 6,
  },
  annotationsViewerList: {
    height: '100%',
    overflowY: 'scroll',
    width: '100%',
    flex: 1,
  },
});

class AnnotationTabs extends Component {
  constructor(props) {
    super(props);

    this.handleChange = this.handleChange.bind(this);

    this.state = {
      selectedTab: 0
    };
  }

  handleChange(event, selectedTab) {
    this.setState({ selectedTab });
  }

  count(resolved) {
    return this.props.segment.events.filter((event) => {
      if (!filterEvent(event)) {
        return false;
      }
      if (resolved && event.id) {
        return true;
      }
      if (!resolved && !event.id) {
        return true;
      }
    }).length;
  }

  renderTab(index) {
    switch (index) {
      case 0:
        return (
          <AnnotationList
            segment={this.props.segment}
            unresolved
          />
        );
      case 1:
        return (<AnnotationList segment={this.props.segment} resolved />);
      default:
        return (
          <AnnotationList
            segment={this.props.segment}
            unresolved
          />
        );
    }
  }

  render() {
    const { classes } = this.props;
    return (
      <div className={classes.root}>
        <div className={classes.annotationsViewer}>
          <Tabs
            value={this.state.selectedTab}
            onChange={this.handleChange}
            classes={{
              indicator: classes.annotationsViewerTabIndicator
            }}
            className={classes.annotationsViewerTabs}
          >
            <Tab label={(
              <Typography className={classes.tabLabelText}>
                <Badge classes={{ badge: classes.tabLabelBadge }} badgeContent={this.count(false)}>
                  &nbsp;
                </Badge>
                Annotations Unresolved
              </Typography>
            )}
            />
            <Tab label={(
              <Typography className={classes.tabLabelText}>
                <Badge classes={{ badge: classes.tabLabelBadge }} badgeContent={this.count(true)}>
                  &nbsp;
                </Badge>
                Resolved
              </Typography>
            )}
            />
          </Tabs>
          <div className={`${classes.annotationsViewerList} x-scrollbar`}>
            { this.renderTab(this.state.selectedTab) }
          </div>
        </div>
      </div>
    );
  }
}

export default withStyles(styles)(AnnotationTabs);
