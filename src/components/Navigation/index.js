import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import debounce from 'debounce';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, FlyToInterpolator,
  WebMercatorViewport } from 'react-map-gl';

import { withStyles, TextField, InputAdornment, Typography } from '@material-ui/core';
import { Search, Room } from '@material-ui/icons';
import Colors from '../../colors';
import GeocodeApi, { MAPBOX_TOKEN } from '../../api/geocode';

const MAP_STYLE = 'mapbox://styles/commaai/cjj4yzqk201c52ss60ebmow0w';
const styles = () => ({
  mapContainer: {
    transition: 'height 0.2s',
    borderBottom: `1px solid ${Colors.white10}`,
  },
  geolocateControl: {
    display: 'none',
  },
  overlay: {
    color: Colors.white,
    borderRadius: 22,
    padding: '12px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
  },
  overlayTextfield: {
    borderRadius: 0,
    '& input': { padding: 0 }
  },
  overlaySearchButton: {
    color: Colors.white30,
  },
  overlaySearchItem: {
    cursor: 'pointer',
    marginTop: 15,
  },
  searchSelect: {
    fontSize: 32,
    color: '#31a1ee',
  },
});

class Navigation extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasFocus: false,
      viewport: {
        longitude: -122.45,
        latitude: 37.78,
        zoom: 0,
      },
      carLocation: null,
      geoLocateCoords: null,
      search: null,
      searchSelect: null,
    };

    this.searchInputRef = React.createRef();

    this.flyToMarkers = this.flyToMarkers.bind(this);
    this.updateMarkerPos = this.updateMarkerPos.bind(this);
    this.renderOverlay = this.renderOverlay.bind(this);
    this.onGeolocate = this.onGeolocate.bind(this);
    this.onSearch = this.onSearch.bind(this);
    this.onSearchSelect = this.onSearchSelect.bind(this);
    this.focus = this.focus.bind(this);
  }

  componentDidMount() {
    this.updateMarkerPos();
  }

  updateMarkerPos() {

  }

  componentDidUpdate(prevProps, prevState) {
    const { geoLocateCoords, searchSelect } = this.state;
    if ((searchSelect && prevState.searchSelect !== searchSelect) ||
      (geoLocateCoords && prevState.geoLocateCoords !== geoLocateCoords))
    {
      this.flyToMarkers();
    }
  }

  onGeolocate(pos) {
    if (pos && pos.coords) {
      console.log(pos);
      this.setState({ geoLocateCoords: [pos.coords.longitude, pos.coords.latitude] });
    }
  }

  async onSearch(ev) {
    if (ev.target.value.length >= 3) {
      const proximity = this.state.carLocation || this.state.geoLocateCoords || undefined;
      const features = await GeocodeApi().forwardLookup(ev.target.value, proximity);
      this.setState({ search: features });
    } else {
      this.setState({ search: null });
    }
  }

  async onSearchSelect(item) {
    console.log(item);
    this.setState({ searchSelect: item, search: null });
  }

  flyToMarkers() {
    const { geoLocateCoords, searchSelect } = this.state;

    const MIN_MAX_BBOX = [[180, 90], [-180, -90]];
    const geoLocateBounds = geoLocateCoords ? [geoLocateCoords, geoLocateCoords] : MIN_MAX_BBOX;
    const searchSelectBounds =
      searchSelect ? [searchSelect.bbox.slice(0, 2), searchSelect.bbox.slice(2, 4)] : MIN_MAX_BBOX;

    const bbox = [[
      Math.min(geoLocateBounds[0][0], searchSelectBounds[0][0]),
      Math.min(geoLocateBounds[0][1], searchSelectBounds[0][1]),
    ], [
      Math.max(geoLocateBounds[1][0], searchSelectBounds[1][0]),
      Math.max(geoLocateBounds[1][1], searchSelectBounds[1][1]),
    ]];

    this.setState({
      viewport: new WebMercatorViewport(this.state.viewport).fitBounds(bbox, { padding: 50, maxZoom: 10 })
    });
  }

  focus() {
    if (!this.state.hasFocus) {
      this.setState({ hasFocus: true });
    }
  }

  render() {
    const { classes } = this.props;
    const { hasFocus, searchSelect, viewport } = this.state;

    return (
      <div className={ classes.mapContainer } style={{ height: hasFocus ? '50vh' : 150 }}>
        <ReactMapGL { ...viewport } onViewportChange={ (viewport) => this.setState({ viewport }) }
          mapStyle={ MAP_STYLE } width="100%" height="100%" onNativeClick={ this.focus } maxPitch={ 0 }
          mapboxApiAccessToken={ MAPBOX_TOKEN } attributionControl={ false } ref={ this.initMap } >
          <GeolocateControl className={ classes.geolocateControl } positionOptions={{ enableHighAccuracy: true }}
            trackUserLocation={ true } showAccuracyCircle={ false } onGeolocate={ this.onGeolocate } auto
            fitBoundsOptions={{ maxZoom: 10 }} />
          { searchSelect &&
            <Marker latitude={ searchSelect.center[1] } longitude={ searchSelect.center[0] }
              offsetLeft={ -16 } offsetTop={ -16 }>
              <Room classes={{ root: classes.searchSelect }} />
            </Marker>
          }
          <HTMLOverlay redraw={ this.renderOverlay } style={{ width: 330, height: 'unset', top: 10, left: 10 }}
            captureScroll={ true } captureDrag={ true } captureClick={ true } captureDoubleClick={ true }
            capturePointerMove={ true } />
        </ReactMapGL>
      </div>
    );
  }

  renderOverlay(width, height, project, unproject) {
    const { classes } = this.props;

    return (
      <div className={ classes.overlay } onClick={ this.focus }>
        <TextField placeholder="search" onChange={ this.onSearch } fullWidth={ true } inputRef={ this.searchInputRef }
          InputProps={{
            classes: { root: classes.overlayTextfield },
            endAdornment: (
              <InputAdornment position="end"><Search className={ classes.overlaySearchButton } /></InputAdornment>
            )
          }} />
        { this.state.search && this.state.search.map((item) => (
          <div key={ item.id } className={ classes.overlaySearchItem } onClick={ () => this.onSearchSelect(item) }>
            <Typography>{ item.place_name }</Typography>
          </div>
        )) }
      </div>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(Navigation));
