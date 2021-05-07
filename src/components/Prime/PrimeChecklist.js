import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import {
  withStyles,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@material-ui/core';


import CheckIcon from '@material-ui/icons/Check';

const styles = () => ({
  checkList: {
    marginLeft: 10,
    marginBottom: 10,
  },
  checkListItem: {
    padding: '7px 0',
    '& svg': { alignSelf: 'flex-start' },
  },
  learnMore: {
    marginBottom: 10,
    '& a': { color: 'white' }
  },
});

const listItems = [
  ['Real-time car location', null],
  ['Take pictures remotely', null],
  ['1 year storage of drive videos', null],
  ['Simple SSH for developers', null],
  ['24/7 connectivity', null],
  ['Unlimited data at 512kbps', 'only offered in United States'],
];

class PrimeChecklist extends Component {
  constructor(props) {
    super(props);

    this.state = {
      moreInfo: (!props.collapsed),
    };
  }

  render() {
    const { classes } = this.props;

    return (
      <>
        <List className={ classes.checkList }>
          { listItems.map((listItemText, i) => {
            return <ListItem key={ i } className={ classes.checkListItem }>
              <ListItemIcon><CheckIcon /></ListItemIcon>
              <ListItemText primary={ listItemText[0] } secondary={ listItemText[1] } />
            </ListItem>;
          }) }
        </List>
        <Typography className={ classes.learnMore }>
          Learn more about comma prime from our <a rel="noopener noreferrer" target="_blank" href="https://comma.ai/faq">FAQ</a>
        </Typography>
      </>
    );
  }
}

const stateToProps = Obstruction({});

export default connect(stateToProps)(withStyles(styles)(PrimeChecklist));
