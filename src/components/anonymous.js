import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import { oauthRedirectLink } from '../api/auth';
import commaSvg from '../static/comma.svg';

const styles = theme => {
  return {
    root: {},
    top: {
      height: '60px',
    },
    title: {
      display: 'inline',
      lineHeight: '60px',
      fontSize: '24px',
    },
    content: {
      maxWidth: '560px',
    },
    tagline: {
      padding: '10px 0',
      fontSize: '18px',
    },
    logInButton: {
      width: '100%',
      background: '#175886',
      border: '1px solid #000000',
      borderRadius: '100px',
      fontSize: '21px',
      height: '80px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    },
    logInLink: {
      textDecoration: 'none',
    },
    logInText: {
      fontSize: '24px',
    }
  }
};

class AnonymousLanding extends Component {
  render () {
    return (
      <Grid container alignItems='center' justify='center' style={{ width: '100%', height: '100%', marginTop: '30vh' }}>
        <Grid container xs={12} className={ this.props.classes.content } direction='column'>
          <Grid item xs={12} alignItems='center' className={ this.props.classes.top }>
            <img src={ commaSvg } />
            <Typography paragraph={false} className={ this.props.classes.title }>explorer</Typography>
          </Grid>
          <Grid item xs={12}>
            <Typography className={ this.props.classes.tagline }>review and annotate your drives</Typography>
          </Grid>
          <a href={ oauthRedirectLink } className={ this.props.classes.logInLink }>
            <div className={ this.props.classes.logInButton }>
              <Typography className={ this.props.classes.logInText }>Log in with Google</Typography>
            </div>
          </a>
        </Grid>
      </Grid>
    );
  }
}

export default withStyles(styles)(AnonymousLanding);
