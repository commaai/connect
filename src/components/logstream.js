import React, { Component } from 'react';
import { connect } from 'react-redux';
import raf from 'raf';
import { withStyles } from '@material-ui/core/styles';
import PropTypes from 'prop-types';
import TimelineWorker from '../timeline';

const styles = (theme) => ({
  root: {
    ...theme.typography.body1,
  }
});

class LogViewer extends Component {
  constructor(props) {
    super(props);

    this.renderLogs = this.renderLogs.bind(this);

    this.eventView = React.createRef();
  }

  componentDidMount() {
    raf(this.renderLogs);
  }

  renderLogs() {
    if (this.eventView.current && this.eventView.current.parentElement) {
      const offset = TimelineWorker.currentOffset();
      const lastEvent = TimelineWorker.lastEvents(50, offset);
      if (!lastEvent.length) {
        this.eventView.current.innerHTML = '';
      } else if (this.lastLastEvent !== lastEvent[0].LogMonoTime) {
        this.eventView.current.innerHTML = lastEvent
          // .filter((log) => log.Can)
          // .slice(0, 10)
          .map((log) => {
            if (log.LogMessage) {
              return {
                LogMonoTime: log.LogMonoTime,
                LogMessage: JSON.parse(log.LogMessage)
              };
            }
            return log;
          })
          .map(JSON.stringify.bind(JSON)).join('\n');
        this.lastLastEvent = lastEvent[0].LogMonoTime;
      }

      raf(this.renderLogs);
    }
  }

  render() {
    const propsToRender = { ...this.props };
    delete propsToRender.classes;

    const { classes } = this.props;

    return (
      <div className={classes.root} style={{ width: '100%', overflow: 'hidden' }}>
        <pre ref={this.eventView} />
        <pre>{ JSON.stringify(propsToRender, null, 2) }</pre>
      </div>
    );
  }
}

LogViewer.propTypes = {
  classes: PropTypes.object.isRequired,
};

function mapStateToProps(state) {
  return state.workerState;
}

export default connect(mapStateToProps)(withStyles(styles)(LogViewer));
