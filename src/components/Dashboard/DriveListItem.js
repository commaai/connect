import React, { Component } from 'react';
import { connect } from 'react-redux';
import fecha from 'fecha';

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
  },
  driveHeaderIntro: {
    display: 'flex',
  },
  driveGridItem: {
    flexGrow: 1,
  },
  driveHeaderIntroSmall: {
    justifyContent: 'center',
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
    const { drive, classes, windowWidth } = this.props;

    const small = windowWidth < 640;

    const { startLocation, endLocation } = this.state;
    const startTime = fecha.format(new Date(drive.startTime), 'HH:mm');
    const startDate = fecha.format(new Date(drive.startTime), small ? 'ddd, MMM D' : 'dddd, MMM D');
    const endTime = fecha.format(new Date(drive.startTime + drive.duration + 1000), 'HH:mm');
    const duration = formatDriveDuration(drive.duration);
    const points = getDrivePoints(drive.duration);

    const gridStyle = small ? {
      date:   { order: 1, maxWidth: '50%', flexBasis: '50%', marginBottom: 12 },
      dur:    { order: 2, maxWidth: '28%', flexBasis: '28%', marginBottom: 12 },
      dist:   { order: 3, maxWidth: '22%', flexBasis: '22%', marginBottom: 12 },
      origin: { order: 4, maxWidth: '50%', flexBasis: '50%' },
      dest:   { order: 5, maxWidth: '50%', flexBasis: '50%' },
    } : {
      date:   { order: 1, maxWidth: '26%', flexBasis: '26%' },
      dur:    { order: 2, maxWidth: '14%', flexBasis: '14%' },
      origin: { order: 3, maxWidth: '22%', flexBasis: '22%' },
      dest:   { order: 4, maxWidth: '22%', flexBasis: '22%' },
      dist:   { order: 5, maxWidth: '10%', flexBasis: '10%' },
      arrow:  { order: 6, maxWidth: '6%',  flexBasis: '6%' },
    };
    return (
      <li key={drive.startTime} className={ `${classes.drive} DriveEntry` }
        onClick={ () => this.handleDriveClicked(drive) }>
        <div className={classes.driveHeader} style={ !small ? { padding: '18px 32px' } : { padding: 18 } }>
          <Grid container>
            <div className={ classes.driveGridItem } style={ gridStyle.date }>
              <Typography className={ classes.firstLine }>
                { startDate }
              </Typography>
              <Typography>
                { startTime } to { endTime }
              </Typography>
            </div>
            <div className={ classes.driveGridItem } style={ gridStyle.dur }>
              <Typography className={ classes.firstLine }>
                { duration.hours > 0 && `${duration.hours.toString()}hr ` }
                { `${duration.minutes} min` }
              </Typography>
              <Typography>
                { `${points} points` }
              </Typography>
            </div>
            <div className={ classes.driveGridItem } style={ gridStyle.origin }>
              <Typography className={ classes.firstLine }>
                { startLocation && startLocation.place }
              </Typography>
              <Typography>
                { startLocation && startLocation.details }
              </Typography>
            </div>
            <div className={ classes.driveGridItem } style={ gridStyle.dest }>
              <Typography className={ classes.firstLine }>
                { endLocation && endLocation.place }
              </Typography>
              <Typography>
                { endLocation && endLocation.details }
              </Typography>
            </div>
            <div className={ classes.driveGridItem } style={ gridStyle.dist }>
              <Typography className={ classes.firstLine }>
                { `${+drive.distanceMiles.toFixed(1)} mi` }
              </Typography>
              <Typography>
                { `${+(drive.distanceMiles * KM_PER_MI).toFixed(1)} km` }
              </Typography>
            </div>
            { !small &&
              <div className={ classes.driveGridItem } style={ gridStyle.arrow }>
                <RightArrow className={classes.driveArrow} />
              </div>
            }
          </Grid>
        </div>
        <Timeline
          className={classes.driveTimeline}
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
