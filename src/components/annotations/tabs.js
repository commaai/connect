import React, { Component } from 'react';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';
import classNames from '@sindresorhus/class-names';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Badge from '@material-ui/core/Badge';

import AnnotationList from './list';
import { filterEvent } from './common';

const styles = theme => {
  return {
    root: {
    },
    badge: {
      marginRight: theme.spacing.unit * 2.5,
      backgroundColor: theme.palette.grey[100],
      top: -6
    },
    upsellDemo: {
      cursor: 'default',
      pointerEvents: 'none',
      opacity: 0.8
    },
  };
};

class AnnotationTabs extends Component {
  constructor (props) {
    super(props);

    this.handleChange = this.handleChange.bind(this);

    this.state = {
      selectedTab: 0
    };
  }

  handleChange (event, selectedTab) {
    this.setState({ selectedTab });
  }

  count (resolved) {
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
    }).length
  }

  render() {
    return (
      <React.Fragment>
        <Tabs
          value={ this.state.selectedTab }
          onChange={ this.handleChange }
          fullWidth
          className={ classNames({
            [this.props.classes.upsellDemo]: this.props.isUpsellDemo
            })}
          >
          <Tab label={
            <Typography>
              <Badge classes={{ badge: this.props.classes.badge }} badgeContent={ this.count(false) }>
                &nbsp;
              </Badge>
              Unresolved
            </Typography>
          } />
          <Tab label={
            <Typography>
              <Badge classes={{ badge: this.props.classes.badge }} badgeContent={ this.count(true) }>
                &nbsp;
              </Badge>
              Resolved
            </Typography>
          } />
        </Tabs>
        { this.renderTab(this.state.selectedTab) }
      </React.Fragment>
    );
  }

  renderTab (index) {
    switch (index) {
      case 0:
        return (
          <AnnotationList
            segment={ this.props.segment }
            unresolved
            isUpsellDemo={ this.props.isUpsellDemo }
          />
        );
      case 1:
        return (<AnnotationList segment={ this.props.segment } resolved />);
    }
  }
}

export default withStyles(styles)(AnnotationTabs);
