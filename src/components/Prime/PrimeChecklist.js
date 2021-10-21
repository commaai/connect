import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, List, ListItem, ListItemIcon, ListItemText, Typography } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';

import ResizeHandler from '../ResizeHandler';

const styles = () => ({
  checkList: {
    marginLeft: 10,
    '& span': { fontSize: 14 },
  },
  checkListItem: {
    '& svg': {
      alignSelf: 'flex-start',
      fontSize: 21,
    },
  },
  learnMore: {
    fontWeight: 500,
    '& a': { color: 'white' },
  },
});

const listItems = [
  ['Real-time car location', null],
  ['Take pictures remotely', null],
  ['1 year storage of drive videos', null],
  ['Simple SSH for developers', null],
  ['24/7 connectivity', null],
  ['Unlimited data at 512kbps', 'only offered in the United States'],
];

class PrimeChecklist extends Component {
  constructor(props) {
    super(props);

    this.state = {
      moreInfo: (!props.collapsed),
      windowWidth: window.innerWidth,
    };
  }

  render() {
    const { classes } = this.props;
    const { windowWidth } = this.state;

    const paddingStyle = windowWidth > 520 ? { padding: '7px 0', } : { padding: '3px 0', };

    return (
      <>
        <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
        <List className={ classes.checkList }>
          { listItems.map((listItemText, i) => {
            return <ListItem key={ i } className={ classes.checkListItem } style={ paddingStyle }>
              <ListItemIcon><CheckIcon /></ListItemIcon>
              <ListItemText primary={ listItemText[0] } secondary={ listItemText[1] } />
            </ListItem>;
          }) }
        </List>
        <Typography className={ classes.learnMore }>
          Learn more about comma prime from our <a rel="noopener noreferrer" target="_blank" href="https://comma.ai/prime#faq">FAQ</a>
        </Typography>
      </>
    );
  }
}

const stateToProps = Obstruction({});

export default connect(stateToProps)(withStyles(styles)(PrimeChecklist));
