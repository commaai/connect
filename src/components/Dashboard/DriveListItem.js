import React, { Component } from 'react';
import { connect } from 'react-redux';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import { selectRange } from '../../actions';
import {
  formatDriveDuration,
  getDrivePoints,
  getDriveStats,
  filterRegularClick,
} from '../../utils';
import GeocodeApi from '../../api/geocode';
import Timeline from '../Timeline';
import { RightArrow } from '../../icons';
import { KM_PER_MI } from '../../utils/conversions';
import Colors from '../../colors';

const styles = (theme) => ({
  drive: {
    background: 'rgba(255, 255, 255, 0.0)',
    background: 'linear-gradient(to bottom, #30373B 0%, #1D2225 100%)',
    borderTop: '1px solid rgba(255, 255, 255, .05)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 12,
    overflow: 'hidden',
    padding: 0,
    transition: 'background .2s',
    textDecoration: 'none',
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
    color: Colors.grey500,
    height: '100%',
    marginLeft: '25%',
    width: 32,
  },
  firstLine: {
    fontWeight: 600,
  },
  stats: {
    width: 40,
    height: 40,
    borderRadius: 20,
    textAlign: 'center',
    fontWeight: 900,
    fontSize: '1.2em',
    lineHeight: '40px',
    backgroundColor: Colors.grey900,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: Colors.black,
    color: Colors.green400,
  },
});

class DriveListDrive extends Component {
  constructor(props) {
    super(props);

    this.state = {
      startLocation: null,
      endLocation: null,
    };
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

  render() {
    const { drive, classes, windowWidth } = this.props;

    const small = windowWidth < 640;

    const { startLocation, endLocation } = this.state;
    const startTs = drive.startTime - 1000;
    const endTs = drive.startTime + drive.duration + 1000;
    const startTime = fecha.format(new Date(drive.startTime), 'HH:mm');
    const startDate = fecha.format(new Date(drive.startTime), small ? 'ddd, MMM D' : 'dddd, MMM D');
    const endTime = fecha.format(new Date(endTs), 'HH:mm');
    const duration = formatDriveDuration(drive.duration);
    const points = getDrivePoints(drive.duration);
    const stats = getDriveStats(drive);

    const gridStyle = small ? {
      stats:   { order: 1, maxWidth: '20%', flexBasis: '20%', marginBottom: 12 },
      date:   { order: 2, maxWidth: '30%', flexBasis: '30%', marginBottom: 12 },
      dur:    { order: 3, maxWidth: '28%', flexBasis: '28%', marginBottom: 12 },
      dist:   { order: 4, maxWidth: '22%', flexBasis: '22%', marginBottom: 12 },
      origin: { order: 5, maxWidth: '50%', flexBasis: '50%' },
      dest:   { order: 6, maxWidth: '50%', flexBasis: '50%' },
    } : {
      stats:   { order: 1, maxWidth: '6%', flexBasis: '6%' },
      date:   { order: 2, maxWidth: '20%', flexBasis: '20%' },
      dur:    { order: 3, maxWidth: '14%', flexBasis: '14%' },
      origin: { order: 4, maxWidth: '22%', flexBasis: '22%' },
      dest:   { order: 5, maxWidth: '22%', flexBasis: '22%' },
      dist:   { order: 6, maxWidth: '10%', flexBasis: '10%' },
      arrow:  { order: 7, maxWidth: '6%',  flexBasis: '6%' },
    };
    return (
      <a key={drive.startTime} className={ `${classes.drive} DriveEntry` } href={ `/${drive.dongleId}/${startTs}/${endTs}` }
        onClick={ filterRegularClick(() => this.props.dispatch(selectRange(startTs, endTs))) }>
        <div className={classes.driveHeader} style={ !small ? { padding: '18px 32px' } : { padding: 18 } }>
          <Grid container>
            {stats ? (
              <div className={classes.driveGridItem} style={gridStyle.stats}>
                <Typography className={classes.stats}>
                  {parseInt(stats.engagedPercentage * 100)}
                </Typography>
              </div>
            ) : null}
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
      </a>
    );
  }
}

export default connect(() => ({}))(withStyles(styles)(DriveListDrive));
