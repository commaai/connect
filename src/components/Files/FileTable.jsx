import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, Divider, Typography, Button, Modal, Paper } from '@material-ui/core';
import { DataGrid } from '@mui/x-data-grid';

import DownloadIcon from '@material-ui/icons/FileDownload';
import Colors from '../../colors';
import Theme from '../../theme';
import ResizeHandler from '../ResizeHandler';

const styles = (theme) => ({
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: 'max-content',
    maxWidth: '90%',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    outline: 'none',
  },
  titleContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  titleIcon: {
    marginRight: 8,
  },
  buttonGroup: {
    textAlign: 'right',
  },
  uploadContainer: {
    margin: `${theme.spacing.unit}px 0`,
    color: Colors.white90,
    textAlign: 'left',
    overflowY: 'auto',
  },
  uploadButton: {
    color: Colors.white,
    borderRadius: 13,
    fontSize: '0.8rem',
    padding: '4px 12px',
    minHeight: 19,
    backgroundColor: Colors.white05,
    '&:hover': {
      backgroundColor: Colors.white10,
    },
  },
  dataGrid: {
    border: 'none',
    '& .MuiDataGrid-row': {
      color: theme.palette.common.white,
      '--DataGrid-rowBorderColor': 'transparent',
    },
    '& .MuiDataGrid-columnHeader': {
      backgroundColor: theme.palette.grey[300],
      color: theme.palette.common.white,
      textAlign: 'center',
    },
    '& .MuiDataGrid-columnHeaderTitle': {
      lineSpacing: 1.5,
      whiteSpace: 'normal',
    },
    '& .MuiDataGrid-footerContainer': {
      color: theme.palette.common.white,
      borderColor: theme.palette.common.white,
    },
    '& .MuiTablePagination-root, & .MuiTablePagination-selectIcon': {
      color: theme.palette.common.white,
    },
    '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': {
      outline: 'none',
    },
  },
});


const FILE_NAMES = {
  qcameras: { filename: 'qcamera.ts', label: "Road Camera (Lo-Res)" },
  cameras: { filename: 'fcamera.hevc', label: 'Road Camera' },
  dcameras: { filename: 'dcamera.hevc', label: "Driver Camera" },
  ecameras: { filename: 'ecamera.hevc', label: "Wide Road Camera" },
  qlogs: { filename: 'qlog.bz2', label: 'Logs (Decimated)' },
  logs: { filename: 'rlog.bz2', label: 'Logs' },
};

class FileTable extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };
  }

  getSegmentIndex(segmentName) {
    return segmentName.split('--').slice(-1)[0];
  }

  filesToRows(files) {
    if (files) {
      const segments = {};
      for (let [key, data] of Object.entries(files)) {
        const [segment, file_type] = key.split('/');
        segments[segment] = { ...segments[segment], ...{ [file_type]: data.url } };
      }

      const sortedSegments = Object.entries(segments).sort((a, b) => {
        const aSegmentIndex = parseInt(this.getSegmentIndex(a[0]));
        const bSegmentIndex = parseInt(this.getSegmentIndex(b[0]));
        if (aSegmentIndex < bSegmentIndex) return -1;
        if (aSegmentIndex > bSegmentIndex) return 1;
        return 0;
      });

      const rows = [];

      for (let [segmentName, segmentFiles] of sortedSegments) {
        rows.push({
          id: this.getSegmentIndex(segmentName),
          segmentName: segmentName,
          ...segmentFiles,
        });
      }

      return rows;
    }
  }

  render() {
    const { classes, currentRoute, files } = this.props;
    const { windowHeight } = this.state;

    const columns = [
      { field: 'id', headerName: '#', type: 'number', width: 5 },
      { field: 'segmentName', headerName: 'Segment', width: 325 },
    ];

    columns.push(
      ...Object.entries(FILE_NAMES).map(([key, { label }]) => {
        return {
          field: key,
          headerName: label,
          headerAlign: 'center',
          align: 'center',
          display: 'flex',
          minWidth: label.includes('Camera') ? 120 : 100,
          sortable: false,
          filterable: false,
          renderCell: (params) => {
            const url = params.value;
            return url ? (
              <Button className={classes.uploadButton} href={url} target="_blank" rel="noopener noreferrer">
                {url.match(/(?<=\/)[\w.]+(?=\?)/gm)?.[0] || 'Download'}
              </Button>
            ) : null;
          },
        };
      })
    );
    columns.slice(-1)[0].width = null;
    columns.slice(-1)[0].flex = 1;

    const rows = this.filesToRows(files);

    return (
      <>
        <ResizeHandler onResize={(ww, wh) => this.setState({ windowWidth: ww, windowHeight: wh })} />
        <Modal aria-labelledby="file-table-modal" open={this.props.open} onClose={this.props.onClose}>
          <Paper className={classes.modal}>
            <div className={classes.titleContainer}>
              <Typography variant="title">
                <DownloadIcon className={classes.titleIcon} />
                Route Files
              </Typography>
              <Typography variant="caption" style={{ marginLeft: 8 }}>
                {currentRoute.fullname}
              </Typography>
            </div>
            <Divider />
            <div className={classes.uploadContainer} style={{ maxHeight: windowHeight * 0.8 }}>
              <DataGrid
                columns={columns}
                rows={rows}
                pageSize={2}
                density="compact"
                getRowClassName={(params) => (params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd')}
                sx={styles(Theme).dataGrid}
              />
            </div>
            <div className={classes.buttonGroup}>
              <Button variant="contained" className={classes.cancelButton} onClick={this.props.onClose}>
                Close
              </Button>
            </div>
          </Paper>
        </Modal>
      </>
    );
  }
}

const stateToProps = Obstruction({
  files: 'files',
  currentRoute: 'currentRoute',
});

export default connect(stateToProps)(withStyles(styles)(FileTable));
