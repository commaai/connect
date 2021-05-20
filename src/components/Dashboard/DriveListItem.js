import React, { Component } from 'react';
import { connect } from 'react-redux';
import fecha from 'fecha';
import { classNames } from 'react-extras';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import { selectRange } from '../../actions';
import { formatDriveDuration, getDrivePoints } from '../../utils';
import GeocodeApi from '../../api/geocode';
import Timeline from '../Timeline';
import { RightArrow } from '../../icons';
import { KM_PER_MI } from '../../utils/conversions';

const styles = (theme) => ({
  drive: {
    background: 'rgba(255, 255, 255, 0.0)',
    background: 'linear-gradient(to bottom, #30373B 0%, #1D2225 100%)',
    borderTop: '1px solid rgba(255, 255, 255, .05)',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 12,
    overflow: 'hidden',
    padding: 0,
    transition: 'background .2s',
    '&:hover': {}
  },
  driveHeader: {
    alignItems: 'center',
    padding: 18,
    paddingLeft: 24,
    paddingRight: 24,
  },
  driveHeaderIntro: {
    display: 'flex',
  },
  driveHeaderIntroSmall: {
    justifyContent: 'center',
  },
  driveAvatar: {
    alignItems: 'center',
    background: '#404B4F',
    borderRadius: 30,
    color: '#fff',
    display: 'flex',
    fontWeight: 600,
    height: 52,
    justifyContent: 'center',
    margin: '0px 3%',
    width: 52,
  },
  driveAvatarSmall: {
    width: 40,
    height: 40,
  },
  driveTimeline: {},
  driveArrow: {
    color: '#404B4F',
    height: '100%',
    marginLeft: '25%',
    width: 32,
  },
  firstLine: {
    fontWeight: 600,
  },
});

class DriveListDrive extends Component {
  constructor(props) {
    super(props);

    this.state = {
      startLocation: null,
      endLocation: null,
    };

    this.handleDriveClicked = this.handleDriveClicked.bind(this);
  }

  componentDidMount() {
    const { drive } = this.props;
    this.mounted = true;
    GeocodeApi().reverseLookup(drive.startCoord).then((startLocation) => {
      if (!this.mounted) {
        return;
      }
      this.setState({ startLocation });
    });
    GeocodeApi().reverseLookup(drive.endCoord).then((endLocation) => {
      if (!this.mounted) {
        return;
      }
      this.setState({ endLocation });
    });
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  handleDriveClicked(drive) {
    const startTime = drive.startTime - 1000;
    const endTime = drive.startTime + drive.duration + 1000;
    this.props.dispatch(selectRange(startTime, endTime));
  }

  render() {
    const { drive, deviceAlias, classes, small } = this.props;
    const { startLocation, endLocation } = this.state;
    const startTime = fecha.format(new Date(drive.startTime), 'HH:mm');
    const startDate = fecha.format(new Date(drive.startTime), 'ddd, MMM D');
    const endTime = fecha.format(new Date(drive.startTime + drive.duration + 1000), 'HH:mm');
    const duration = formatDriveDuration(drive.duration);
    const points = getDrivePoints(drive.duration);
    return (
      <li
        key={drive.startTime}
        className={classNames(classes.drive, 'DriveEntry')}
        onClick={ () => this.handleDriveClicked(drive) }
      >
        <div className={classes.driveHeader}>
          <Grid container>
            { !small &&
              <Grid item xs={ 1 } className={classes.driveHeaderIntro}>
                <div className={classes.driveAvatar}>
                  { drive.annotations }
                </div>
              </Grid>
            }
            <Grid item xs={ small ? 8 : 3 }>
              <Typography className={ classes.firstLine }>
                { `${startDate} @ ${startTime} to ${endTime}` }
              </Typography>
              <Typography>
                { deviceAlias }
              </Typography>
            </Grid>
            <Grid item xs={ 2 }>
              <Typography className={ classes.firstLine }>
                { duration.hours > 0 && `${duration.hours.toString()}hr ` }
                { `${duration.minutes} min` }
              </Typography>
              <Typography>
                { `${points} points` }
              </Typography>
            </Grid>
            { small &&
              <Grid item xs={ 2 } className={classes.driveHeaderIntro + ' ' + classes.driveHeaderIntroSmall}>
                <div className={ classes.driveAvatar + ' ' + classes.driveAvatarSmall }>
                  { drive.annotations }
                </div>
              </Grid>
            }
            <Grid item xs={ small ? 4 : 2 }>
              <Typography className={ classes.firstLine }>
                { startLocation && startLocation.neighborhood }
              </Typography>
              <Typography>
                { startLocation && (`${startLocation.locality}, ${startLocation.region}`) }
              </Typography>
            </Grid>
            <Grid item xs={ small ? 4 : 2 }>
              <Typography className={ classes.firstLine }>
                { endLocation && endLocation.neighborhood }
              </Typography>
              <Typography>
                { endLocation && (`${endLocation.locality}, ${endLocation.region}`) }
              </Typography>
            </Grid>
            <Grid item xs={ small ? 2 : 1 }>
              <Typography className={ classes.firstLine }>
                { `${+drive.distanceMiles.toFixed(1)} mi` }
              </Typography>
              <Typography>
                { `${+(drive.distanceMiles * KM_PER_MI).toFixed(1)} km` }
              </Typography>
            </Grid>
            <Grid item xs={ small ? 2 : 1 }>
              <RightArrow className={classes.driveArrow} />
            </Grid>
          </Grid>
        </div>
        <Timeline
          className={classes.driveTimeline}
          zoomed
          colored
          hasThumbnails
          hasGradient
          zoomOverride={{
            start: drive.startTime,
            end: drive.startTime + drive.duration
          }}
        />
      </li>
    );
  }
}

export default connect(() => ({}))(withStyles(styles)(DriveListDrive));
