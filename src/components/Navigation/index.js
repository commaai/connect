import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import debounce from 'debounce';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, FlyToInterpolator, Source,
  WebMercatorViewport, Layer} from 'react-map-gl';
import { withStyles, TextField, InputAdornment, Typography, Button } from '@material-ui/core';
import { Search, Room, Clear } from '@material-ui/icons';
import moment from 'moment';

import { athena as Athena, devices as Devices } from '@commaai/comma-api';
import Colors from '../../colors';
import GeocodeApi, { MAPBOX_TOKEN } from '../../api/geocode';
import { car_pin } from '../../icons';
import ResizeHandler from '../ResizeHandler';

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
    maxHeight: 'calc(60vh - 20px)',
    display: 'flex',
    flexDirection: 'column',
  },
  overlayTextfield: {
    borderRadius: 0,
    '& input': {
      padding: 0,
      height: 24,
    },
  },
  overlaySearchButton: {
    color: Colors.white30,
  },
  overlayClearButton: {
    color: Colors.white30,
    cursor: 'pointer',
  },
  overlaySearchResults: {
    marginTop: 5,
    borderTop: `1px solid ${Colors.white20}`,
    flexGrow: 1,
    overflow: 'auto',
  },
  overlaySearchItem: {
    cursor: 'pointer',
    marginTop: 15,
  },
  overlaySearchDetails: {
    color: Colors.white40,
  },
  searchPin: {
    cursor: 'pointer',
    fontSize: 36,
    color: '#31a1ee',
  },
  searchSelect: {
    fontSize: 36,
    color: '#31a1ee',
  },
  searchSelectBox: {
    borderRadius: 22,
    padding: '12px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    color: Colors.white,
    display: 'flex',
    flexDirection: 'column',
  },
  searchSelectBoxHeader: {
    display: 'flex',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bold: {
    fontWeight: 600,
  },
  searchSelectButton: {
    marginLeft: 10,
    backgroundColor: Colors.white,
    color: Colors.grey800,
    borderRadius: 22,
    borderRadius: 30,
    color: '#404B4F',
    textTransform: 'none',
    minHeight: 'unset',
    '&:hover': {
      background: '#ddd',
      color: '#404B4F',
    },
    '&:disabled': {
      background: '#ddd',
      color: '#404B4F',
    },
  },
  searchSelectButtonFake: {
    padding: '8px 16px',
    background: '#ddd',
    minWidth: 100,
    textAlign: 'center',
  },
  searchSelectBoxDetails: {
    color: Colors.white40,
  },
  carPin: {
    width: 36,
    height: 36,
  },
  carPinTooltip: {
    textAlign: 'center',
    borderRadius: 14,
    fontSize: '0.8em',
    padding: '6px 8px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    color: Colors.white,
  },
});

const initialState = {
  hasFocus: false,
  viewport: {
    longitude: -122.45,
    latitude: 37.78,
    zoom: 0,
  },
  carOnline: true,
  carLocation: null,
  carLocationTime: null,
  geoLocateCoords: null,
  search: null,
  route: null,
  searchSelect: null,
  searchLooking: false,
  windowWidth: window.innerWidth,
}

class Navigation extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...initialState,
      windowWidth: window.innerWidth,
    };

    this.searchInputRef = React.createRef();
    this.searchSelectBoxRef = React.createRef();
    this.overlayRef = React.createRef();
    this.carPinTooltipRef = React.createRef();

    this.flyToMarkers = this.flyToMarkers.bind(this);
    this.renderOverlay = this.renderOverlay.bind(this);
    this.renderSearchOverlay = this.renderSearchOverlay.bind(this);
    this.onGeolocate = this.onGeolocate.bind(this);
    this.onSearch = debounce(this.onSearch.bind(this), 200);
    this.onSearchSelect = this.onSearchSelect.bind(this);
    this.onSearchBlur = this.onSearchBlur.bind(this);
    this.focus = this.focus.bind(this);
    this.updateDevice = this.updateDevice.bind(this);
    this.formatDistance = this.formatDistance.bind(this);
    this.formatDuration = this.formatDuration.bind(this);
    this.navigate = this.navigate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.toggleCarPinTooltip = this.toggleCarPinTooltip.bind(this);
    this.clearSearch = this.clearSearch.bind(this);

    this.updateDeviceTimeout = null;
    this.updateDeviceTimeoutTime = 5000;
  }

  componentDidMount() {
    this.componentDidUpdate({});
  }

  componentWillUnmount() {
    if (this.updateDeviceTimeout) {
      clearInterval(this.updateDeviceTimeout);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const { dongleId } = this.props;
    const { geoLocateCoords, search, carLocation, searchSelect } = this.state;

    if ((carLocation && !prevState.carLocation) || (geoLocateCoords && !prevState.geoLocateCoords) ||
      (searchSelect && prevState.searchSelect !== searchSelect) || (search && prevState.search !== search))
    {
      this.flyToMarkers();
    }

    if (prevProps.dongleId !== dongleId) {
      this.setState({
        ...initialState,
        windowWidth: window.innerWidth,
      });
      if (this.searchInputRef.current) {
        this.searchInputRef.current.value = '';
      }
      this.updateDeviceTimeoutTime = 5000;
      this.updateDevice();
    }
  }

  updateDevice() {
    const { dongleId } = this.props;

    // get last known location
    Devices.fetchLocation(dongleId).then((resp) => {
      this.setState({
        carLocation: [resp.lng, resp.lat],
        carLocationTime: resp.time,
      });
    }).catch(console.log);

    // see if device can be reached
    const payload = {
      method: "getMessage",
      params: { service: "deviceState", timeout: 3000 },
      jsonrpc: "2.0",
      id: 0,
    };

    Athena.postJsonRpcPayload(dongleId, payload).then((resp) => {
      this.setState({ carOnline: resp.result });
    }).catch(() => {
      this.setState({ carOnline: false });
      if (this.searchInputRef.current) {
        this.searchInputRef.current.value = '';
      }
    });

    this.updateDeviceTimeout = setTimeout(this.updateDevice, this.updateDeviceTimeoutTime);
    this.updateDeviceTimeoutTime *= 2;
  }

  onGeolocate(pos) {
    if (pos && pos.coords) {
      this.setState({ geoLocateCoords: [pos.coords.longitude, pos.coords.latitude] });
    }
  }

  onSearch() {
    const searchInput = this.searchInputRef.current;
    this.focus();
    if (searchInput && searchInput.value.length >= 3) {
      const proximity = this.state.carLocation || this.state.geoLocateCoords || undefined;
      GeocodeApi().forwardLookup(searchInput.value, proximity).then((features) => {
        this.setState({
          searchSelect: null,
          search: features.filter((item, i) => i < 4 || item.relevance == 1),
          searchLooking: false,
        });
      });
    } else {
      this.setState({ searchSelect: null, search: null, searchLooking: false });
    }
  }

  onSearchSelect(item) {
    this.setState({
      searchSelect: item,
      search: null,
      searchLooking: false,
    });
    if (this.state.carLocation) {
      GeocodeApi().getDirections([this.state.carLocation, item.center]).then((route) => {
        this.setState({
          searchSelect: {
            ...item,
            route: route[0],
          },
          search: null,
          searchLooking: false,
        });
      });
    }
  }

  onSearchBlur(ev) {
    if (this.state.search && this.searchInputRef.current &&
      this.overlayRef.current && this.overlayRef.current !== ev.relatedTarget)
    {
      this.setState({ searchLooking: true });
    }
  }

  clearSearch() {
    if (this.searchInputRef.current) {
      this.searchInputRef.current.value = '';
    }
    this.setState({
      search: null,
      route: null,
      searchSelect: null,
      searchLooking: false,
    }, this.flyToMarkers);
  }

  flyToMarkers() {
    const { geoLocateCoords, search, searchSelect, carLocation, windowWidth } = this.state;

    const bounds = [];
    if (geoLocateCoords) {
      bounds.push([geoLocateCoords, geoLocateCoords]);
    }
    if (carLocation) {
      bounds.push([carLocation, carLocation]);
    }
    if (searchSelect) {
      bounds.push([searchSelect.center, searchSelect.center]);
    }
    if (search) {
      search.forEach((item) => bounds.push([item.center, item.center]));
    }

    if (bounds.length) {
      const bbox = [[
        Math.min.apply(null, bounds.map((e) => e[0][0])),
        Math.min.apply(null, bounds.map((e) => e[0][1])),
      ], [
        Math.max.apply(null, bounds.map((e) => e[1][0])),
        Math.max.apply(null, bounds.map((e) => e[1][1])),
      ]];

      const bottomBoxHeight = this.searchSelectBoxRef.current ?
        this.searchSelectBoxRef.current.getBoundingClientRect().height + 10 : 0
      const padding = {
        left: (windowWidth < 600 || !search) ? 20 : 360,
        right: 20,
        top: 82,
        bottom: bottomBoxHeight + 20,
      };
      if (this.state.viewport.width) {
        this.setState({
          viewport: new WebMercatorViewport(this.state.viewport).fitBounds(bbox, { padding: padding, maxZoom: 10 })
        });
      }
    }
  }

  focus() {
    if (!this.state.hasFocus) {
      this.setState({ hasFocus: true });
    }
  }

  formatDistance(meters) {
    const { searchSelect } = this.state;

    let metric = false;
    if (searchSelect && searchSelect.context) {
      const country = searchSelect.context[searchSelect.context.length - 1];
      if (country.id.substr(0, 7) === 'country' && country.short_code !== 'us' && country.short_code !== 'gb') {
        metric = true;
      }
    }
    if (metric) {
      return (meters / 1000.0).toFixed(1) + " km";
    }
    return (meters / 1609.34).toFixed(1) + " mi";
  }

  formatDuration(seconds) {
    let mins = Math.round(seconds / 60.0);
    let res = '';
    if (mins >= 60) {
      const hours = Math.floor(mins / 60.0);
      mins -= hours * 60;
      res += `${hours} hr `;
    }
    return `${res}${mins} min`;
  }

  navigate() {
    const { dongleId, hasNav } = this.props;
    const { searchSelect } = this.state;

    if (!hasNav) {
      return;
    }

    this.setState({ searchSelect: {
      ...searchSelect,
      settingDest: true,
      success: false,
    }});

    const payload = {
      method: "setNavDestination",
      params: {
        latitude: searchSelect.center[1],
        longitude: searchSelect.center[0],
      },
      jsonrpc: "2.0",
      id: 0,
    };

    Athena.postJsonRpcPayload(dongleId, payload).then((resp) => {
      if (resp.result) {
        this.setState({ searchSelect: {
          ...searchSelect,
          settingDest: true,
          success: true,
        }});
      } else {
        this.setState({ searchSelect: {
          ...searchSelect,
          settingDest: false,
          success: false,
        }});
        console.log(resp);
      }
    }).catch((err) => {
      console.log(err);
      this.setState({ searchSelect: {
        ...searchSelect,
        settingDest: false,
        success: false,
      }});
    });
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  toggleCarPinTooltip(visible) {
    const tooltip = this.carPinTooltipRef.current;
    if (tooltip) {
      tooltip.style.visibility = visible ? 'visible' : 'hidden';
    }
  }

  render() {
    const { classes, hasNav } = this.props;
    const { hasFocus, search , searchSelect, carLocation, carLocationTime, viewport, windowWidth } = this.state;

    const cardStyle = windowWidth < 600 ?
      { width: 'auto', height: 'auto', top: 'auto', bottom: 'auto', left: 10, right: 10 } :
      { width: 330, height: 'auto', top: 'auto', bottom: 'auto', left: 10 };

    let carPinTooltipStyle = { transform: 'translate(calc(-50% + 18px), 0)' };
    if (carLocation) {
      const pixelsAvailable = viewport.height - new WebMercatorViewport(viewport).project(carLocation)[1];
      if (pixelsAvailable < 50) {
        carPinTooltipStyle = { transform: 'translate(calc(-50% + 18px), -87px)' };
      }
    }

    return (
      <div className={ classes.mapContainer } style={{ height: (hasFocus && hasNav) ? '60vh' : 200 }}>
        <ResizeHandler onResize={ this.onResize } />
        <ReactMapGL { ...viewport } onViewportChange={ (viewport) => this.setState({ viewport }) }
          mapStyle={ MAP_STYLE } width="100%" height="100%" onNativeClick={ this.focus } maxPitch={ 0 }
          mapboxApiAccessToken={ MAPBOX_TOKEN } attributionControl={ false }>
          <GeolocateControl className={ classes.geolocateControl } positionOptions={{ enableHighAccuracy: true }}
            showAccuracyCircle={ false } onGeolocate={ this.onGeolocate } auto={ hasFocus }
            fitBoundsOptions={{ maxZoom: 10 }} trackUserLocation={true} onViewportChange={ this.flyToMarkers } />
          { searchSelect && searchSelect.route &&
            <Source id="my-data" type="geojson" data={ searchSelect.route.geometry }>
              <Layer type="line" layout={{ 'line-cap': 'round', 'line-join': 'bevel' }}
                paint={{ 'line-color': '#31a1ee', 'line-width': 3, 'line-blur': 1 }}  />
            </Source>
          }
          { carLocation &&
            <Marker latitude={ carLocation[1] } longitude={ carLocation[0] } offsetLeft={ -18 } offsetTop={ -33 }
              captureDrag={ false } captureClick={ true } captureDoubleClick={ false }>
              <img className={ classes.carPin } src={ car_pin } onMouseEnter={ () => this.toggleCarPinTooltip(true) }
                onMouseLeave={ () => this.toggleCarPinTooltip(false) } />
              <div className={ classes.carPinTooltip } ref={ this.carPinTooltipRef }
                style={{ ...carPinTooltipStyle, visibility: 'hidden' }}>
                { moment(carLocationTime).format('LT') },<br />
                { moment(carLocationTime).fromNow() }
              </div>
            </Marker>
          }
          { search && search.map((item) =>
            <Marker latitude={ item.center[1] } longitude={ item.center[0] } key={ item.id } offsetLeft={ -18 }
              offsetTop={ -33 } captureDrag={ false } captureClick={ false } captureDoubleClick={ false }>
              <Room classes={{ root: classes.searchPin }} onClick={ () => this.onSearchSelect(item) } />
            </Marker>
          )}
          { searchSelect &&
            <Marker latitude={ searchSelect.center[1] } longitude={ searchSelect.center[0] } offsetLeft={ -18 }
              offsetTop={ -33 } captureDrag={ false } captureClick={ false } captureDoubleClick={ false }>
              <Room classes={{ root: classes.searchSelect }}/>
            </Marker>
          }
          { hasNav &&
            <HTMLOverlay redraw={ this.renderOverlay } style={{ ...cardStyle, top: 10 }}
              captureScroll={ true } captureDrag={ true } captureClick={ true } captureDoubleClick={ true }
              capturePointerMove={ true } />
          }
          { searchSelect &&
            <HTMLOverlay redraw={ this.renderSearchOverlay } captureScroll={ true } captureDrag={ true }
              captureClick={ true } captureDoubleClick={ true } capturePointerMove={ true }
              style={{ ...cardStyle, bottom: 10 }} />
          }
        </ReactMapGL>
      </div>
    );
  }

  renderOverlay() {
    const { classes } = this.props;
    const { carOnline, search, searchLooking } = this.state;

    return (
      <div className={ classes.overlay } ref={ this.overlayRef } tabIndex={ 0 } onBlur={ this.onSearchBlur }
        onClick={ this.focus }>
        <TextField onChange={ this.onSearch } fullWidth={ true } inputRef={ this.searchInputRef }
          disabled={ !carOnline } placeholder={ carOnline ? "search" : "device not online" }
          InputProps={{
            onFocus: this.onSearch,
            onBlur: this.onSearchBlur,
            classes: { root: classes.overlayTextfield },
            endAdornment: carOnline ? ( <>
                { this.searchInputRef.current && this.searchInputRef.current.value &&
                  <InputAdornment position="end">
                    <Clear className={ classes.overlayClearButton } onClick={ this.clearSearch } />
                  </InputAdornment>
                }
                <InputAdornment position="end"><Search className={ classes.overlaySearchButton } /></InputAdornment>
              </> ) :
              null
          }} />
        { search && !searchLooking &&
          <div className={ `${classes.overlaySearchResults} scrollstyle` }>
            { search.map((item) => (
              <div key={ item.id } className={ classes.overlaySearchItem } onClick={ () => this.onSearchSelect(item) }>
                <Typography>
                  { item.place_name.split(', ', 1) }
                  <span className={ classes.overlaySearchDetails }>
                    , { item.place_name.split(', ').slice(1).join(', ') }
                  </span>
                </Typography>
              </div>
            )) }
          </div>
        }
      </div>
    );
  }

  renderSearchOverlay() {
    const { classes } = this.props;
    const { searchSelect, carOnline } = this.state;

    return (
      <div className={ classes.searchSelectBox } ref={ this.searchSelectBoxRef }>
        <div className={ classes.searchSelectBoxHeader }>
          <div>
            <Typography className={ classes.bold }>{ searchSelect.place_name.split(', ', 1) }</Typography>
            { searchSelect.route &&
              <Typography className={ classes.searchSelectBoxDetails }>
                { this.formatDistance(searchSelect.route.distance) } (
                { this.formatDuration(searchSelect.route.duration) })
              </Typography>
            }
          </div>
          { searchSelect.settingDest ?
            <Typography className={ `${classes.searchSelectButton} ${classes.searchSelectButtonFake}` }>
              { searchSelect.success ? "destination set" : "..." }
            </Typography>
          :
            <Button disabled={ !carOnline || !searchSelect.route } classes={{ root: classes.searchSelectButton }}
              onClick={ this.navigate }>
              navigate
            </Button>
          }
        </div>
        <Typography className={ classes.searchSelectBoxDetails }>
          { searchSelect.place_name.split(', ').slice(1).join(', ') }
        </Typography>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
});

export default connect(stateToProps)(withStyles(styles)(Navigation));
