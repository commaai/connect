import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, Source, WebMercatorViewport, Layer } from 'react-map-gl';
import { withStyles, TextField, InputAdornment, Typography, Button } from '@material-ui/core';
import dayjs from 'dayjs';

import { api } from '../../api/backend';
import { athena } from '../../api';
import { analyticsEvent } from '../../actions';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN, reverseLookup, forwardLookup, getDirections } from '../../utils/geocode';
import Colors from '../../colors';
import { Clear, PinCarIcon, PinMarkerIcon } from '../../icons';
import { deviceIsOnline, timeFromNow } from '../../utils';
import VisibilityHandler from '../VisibilityHandler';
import { subscribeWindowSize } from '../../hooks/window';
import * as Utils from './utils';
import { isIos } from '../../utils/browser.js';

const styles = () => ({
  mapContainer: {
    borderBottom: `1px solid ${Colors.white10}`,
  },
  mapError: {
    position: 'relative',
    marginTop: 20,
    marginLeft: 20,
    '& p': { color: Colors.white50 },
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
    maxHeight: 'calc(60vh - 100px)',
    display: 'flex',
    flexDirection: 'column',
    outline: 'none !important',
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
    marginTop: 3,
    paddingRight: 3,
    flexGrow: 1,
    overflowY: 'auto',
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: Colors.white20,
    },
  },
  overlaySearchResultsHr: {
    marginTop: 2,
    borderTop: `1px solid ${Colors.white20}`,
  },
  overlaySearchItem: {
    cursor: 'pointer',
    marginTop: 15,
    '&:first-child': {
      marginTop: 10,
    },
  },
  overlaySearchNoResults: {
    marginTop: 10,
    fontSize: 14,
  },
  overlaySearchNoLocation: {
    marginTop: 10,
    fontSize: 14,
    color: Colors.orange100,
  },
  overlaySearchDetails: {
    color: Colors.white40,
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
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  searchSelectBoxTitle: {
    flexBasis: 'auto',
  },
  searchSelectBoxButtons: {
    display: 'flex',
    flexWrap: 'wrap-reverse',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  bold: {
    fontWeight: 600,
  },
  searchSelectButton: {
    marginLeft: 8,
    padding: '6px 12px',
    backgroundColor: Colors.white,
    borderRadius: 15,
    color: Colors.grey900,
    textTransform: 'none',
    minHeight: 'unset',
    flexGrow: 1,
    maxWidth: 125,
    '&:hover': {
      background: '#ddd',
      color: Colors.grey900,
    },
    '&:disabled': {
      background: '#ddd',
      color: Colors.grey900,
    },
  },
  searchSelectButtonSecondary: {
    marginLeft: 8,
    padding: '4.5px 12px',
    borderRadius: 15,
    textTransform: 'none',
    minHeight: 'unset',
    flexGrow: 1,
    maxWidth: 125,
    border: `1.5px solid ${Colors.white50}`,
    '&:disabled': {
      border: `1.5px solid ${Colors.white20}`,
    },
  },
  searchSelectBoxDetails: {
    color: Colors.white40,
  },
  pin: {
    width: 20,
    height: 32,
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
  researchArea: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    padding: '6px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey900,
    },
    '& svg': {
      marginRight: 6,
    },
  },
  clearSearchSelect: {
    padding: 5,
    fontSize: 20,
    cursor: 'pointer',
    position: 'absolute',
    left: -6,
    top: -8,
    height: 24,
    width: 24,
    borderRadius: 12,
    backgroundColor: Colors.grey900,
    color: Colors.white,
    border: `1px solid ${Colors.grey600}`,
    '&:hover': {
      backgroundColor: Colors.grey700,
    },
  },
});

const initialState = {
  hasFocus: false,
  carLastLocation: null,
  carLastLocationTime: null,
  geoLocateCoords: null,
  search: null,
  searchSelect: null,
  navError: null,
  searchLooking: false,
  noFly: false,
  windowWidth: window.innerWidth,
};

class Navigation extends Component {
  constructor(props) {
    super(props);
    this.mounted = null;
    this.state = {
      ...initialState,
      viewport: {
        ...DEFAULT_LOCATION,
        zoom: 5,
      },
      mapError: null,
      windowWidth: window.innerWidth,
    };

    this.mapContainerRef = React.createRef();
    this.searchSelectBoxRef = React.createRef();
    this.searchInputRef = React.createRef();
    this.carPinTooltipRef = React.createRef();

    this.onSearch = this.onSearch.bind(this);
    this.onFocus = this.onFocus.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.renderOverlay = this.renderOverlay.bind(this);
    this.navigate = this.navigate.bind(this);
    this.researchArea = this.researchArea.bind(this);
    this.checkWebGLSupport = this.checkWebGLSupport.bind(this);
    this.flyToMarkers = this.flyToMarkers.bind(this);
    this.renderSearchOverlay = this.renderSearchOverlay.bind(this);
    this.onGeolocate = this.onGeolocate.bind(this);
    this.onCarSelect = this.onCarSelect.bind(this);
    this.focus = this.focus.bind(this);
    this.updateDevice = this.updateDevice.bind(this);
    this.toggleCarPinTooltip = this.toggleCarPinTooltip.bind(this);
    this.itemLoc = this.itemLoc.bind(this);
    this.itemLngLat = this.itemLngLat.bind(this);
    this.viewportChange = this.viewportChange.bind(this);
    this.getDeviceLastLocation = this.getDeviceLastLocation.bind(this);
    this.getCarLocation = this.getCarLocation.bind(this);
    this.carLocationCircle = this.carLocationCircle.bind(this);
    this.clearSearchSelect = this.clearSearchSelect.bind(this);
    this.onContainerRef = this.onContainerRef.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
    this.unsubscribeWindowSize = subscribeWindowSize(({ width }) => {
      this.setState({ windowWidth: width });
    });
    this.checkWebGLSupport();
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { dongleId, device } = this.props;
    const { geoLocateCoords, search, carLastLocation, searchSelect } = this.state;

    if ((carLastLocation && !prevState.carLastLocation)
      || (geoLocateCoords && !prevState.geoLocateCoords) || (searchSelect && prevState.searchSelect !== searchSelect)
      || (search && prevState.search !== search)) {
      this.flyToMarkers();
    }

    if (prevProps.dongleId !== dongleId) {
      clearTimeout(this.searchTimer);
      this.searchController?.abort();
      this.routeController?.abort();
      if (this.searchInputRef.current) this.searchInputRef.current.value = '';
      this.setState({
        ...initialState,
        windowWidth: window.innerWidth,
      });
    }

    if (prevProps.device !== device) {
      this.updateDevice();
    }

    if (!prevState.hasFocus && this.state.hasFocus) {
      this.props.dispatch(analyticsEvent('nav_focus', {
        has_car_location: Boolean(carLastLocation),
      }));
    }

    if (search && prevState.search !== search) {
      this.props.dispatch(analyticsEvent('nav_search', {
        panned: this.state.noFly || this.state.searchLooking,
      }));
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.unsubscribeWindowSize?.();
    clearTimeout(this.searchTimer);
    this.searchController?.abort();
    this.routeController?.abort();
  }

  checkWebGLSupport() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      this.setState({ mapError: 'Failed to get WebGL context, your browser or device may not support WebGL.' });
    }
  }

  updateDevice() {
    this.getDeviceLastLocation();
  }

  async getDeviceLastLocation() {
    const { dongleId, device } = this.props;
    if (device.shared) {
      return;
    }
    try {
      const resp = await api.devices.fetchLocation(dongleId);
      if (this.mounted && dongleId === this.props.dongleId) {
        this.setState({
          carLastLocation: [resp.lng, resp.lat],
          carLastLocationTime: resp.time,
        }, this.flyToMarkers);
      }
    } catch (err) {
      if (!err.message || err.message.indexOf('no_segments_uploaded') === -1) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_fetch_location' });
      }
    }
  }

  getCarLocation() {
    const { carLastLocation, carLastLocationTime } = this.state;

    if (carLastLocation) {
      return {
        location: carLastLocation,
        accuracy: 0,
        time: carLastLocationTime,
      };
    }
    return null;
  }

  onGeolocate(pos) {
    if (pos && pos.coords) {
      this.setState({ geoLocateCoords: [pos.coords.longitude, pos.coords.latitude] });
    }
  }

  onSearch() {
    this.focus();
    clearTimeout(this.searchTimer);
    this.searchController?.abort();
    this.routeController?.abort();
    this.setState({ searchSelect: null, navError: null });
    const query = this.searchInputRef.current?.value.trim();
    if (!query || query.length < 3) {
      this.setState({ search: null });
      return;
    }
    const request = new AbortController();
    this.searchController = request;
    this.searchTimer = setTimeout(async () => {
      const vp = this.state.viewport;
      const proximity = this.getCarLocation()?.location || this.state.geoLocateCoords || [vp.longitude, vp.latitude];
      try {
        const search = await forwardLookup(query, proximity, request.signal);
        if (this.mounted && !request.signal.aborted) this.setState({ search, noFly: false, searchLooking: false });
      } catch {
        if (this.mounted && !request.signal.aborted) this.setState({ navError: 'Could not search for places. Please try again.' });
      }
    }, 200);
  }

  onFocus() {
    this.focus();
    this.setState({ searchSelect: null, noFly: false });
  }

  clearSearch() {
    clearTimeout(this.searchTimer);
    this.searchController?.abort();
    this.routeController?.abort();
    this.searchInputRef.current.value = '';
    this.setState({ search: null, searchSelect: null, navError: null, noFly: false });
    this.searchInputRef.current.focus();
  }

  async onSearchSelect(item) {
    this.routeController?.abort();
    this.setState({ searchSelect: item, noFly: false, navError: null });
    const start = this.getCarLocation()?.location || this.state.geoLocateCoords;
    if (!start) return;
    const request = new AbortController();
    this.routeController = request;
    try {
      const routes = await getDirections([start, this.itemLngLat(item)], request.signal);
      if (this.mounted && !request.signal.aborted) {
        this.setState({ searchSelect: { ...item, route: routes[0] } });
      }
    } catch {
      if (this.mounted && !request.signal.aborted) this.setState({ navError: 'Could not preview route. You can still navigate.' });
    }
  }

  async navigate() {
    const { device, dongleId } = this.props;
    const item = this.state.searchSelect;
    if (!device.prime || !deviceIsOnline(device) || item.settingDest) return;
    this.setState({ searchSelect: { ...item, settingDest: true }, navError: null });
    try {
      const response = await athena.postJsonRpcPayload(dongleId, {
        jsonrpc: '2.0', id: 0, method: 'setNavDestination',
        params: { latitude: item.position.lat, longitude: item.position.lng },
      });
      if (!this.mounted || this.props.dongleId !== dongleId || this.state.searchSelect?.id !== item.id) return;
      if (response?.result?.success !== 1) throw new Error('destination failed');
      this.setState({ searchSelect: { ...this.state.searchSelect, settingDest: false, success: true } });
    } catch {
      if (this.mounted && this.props.dongleId === dongleId && this.state.searchSelect?.id === item.id) {
        this.setState({ searchSelect: { ...this.state.searchSelect, settingDest: false }, navError: 'Could not set destination. Please try again.' });
      }
    }
  }

  onCarSelect(carLocation) {
    this.routeController?.abort();
    this.focus();

    const [lng, lat] = carLocation.location;
    const item = {
      address: {
        label: '',
      },
      position: {
        lng, lat,
      },
      resultType: 'car',
      title: '',
    };

    this.props.dispatch(analyticsEvent('nav_search_select', {
      source: 'car',
      panned: this.state.noFly,
      distance: item.distance,
    }));

    this.setState({
      noFly: false,
      searchSelect: item,
      searchLooking: false,
    });

    reverseLookup(carLocation.location, true).then((location) => {
      if (!location) {
        return;
      }

      this.setState((prevState) => ({
        searchSelect: {
          ...prevState.searchSelect,
          address: {
            label: location.details,
          },
          title: location.place,
        },
      }));
    });
  }

  clearSearchSelect() {
    this.routeController?.abort();
    this.setState({
      navError: null,
      noFly: false,
      searchSelect: null,
      searchLooking: false,
    });
  }

  flyToMarkers() {
    const { noFly, geoLocateCoords, search, searchSelect, windowWidth, viewport } = this.state;
    const carLocation = this.getCarLocation();

    if (noFly) {
      return;
    }

    const bounds = [];
    if (geoLocateCoords) {
      bounds.push([geoLocateCoords, geoLocateCoords]);
    }
    if (carLocation) {
      bounds.push([carLocation.location, carLocation.location]);
    }
    if (searchSelect) {
      bounds.push(this.itemLngLat(searchSelect, true));
    } else if (search) {
      search.forEach((item) => bounds.push(this.itemLngLat(item, true)));
    }

    if (bounds.length) {
      const bbox = [[
        Math.min.apply(null, bounds.map((e) => e[0][0])),
        Math.min.apply(null, bounds.map((e) => e[0][1])),
      ], [
        Math.max.apply(null, bounds.map((e) => e[1][0])),
        Math.max.apply(null, bounds.map((e) => e[1][1])),
      ]];

      if (Math.abs(bbox[0][0] - bbox[1][0]) < 0.01) {
        bbox[0][0] -= 0.01;
        bbox[0][1] += 0.01;
      }
      if (Math.abs(bbox[1][0] - bbox[1][1]) < 0.01) {
        bbox[1][0] -= 0.01;
        bbox[1][1] += 0.01;
      }

      const bottomBoxHeight = (this.searchSelectBoxRef.current && viewport.height > 200)
        ? this.searchSelectBoxRef.current.getBoundingClientRect().height + 10 : 0;

      const padding = {
        left: (windowWidth < 600 || !search) ? 20 : 390,
        right: 20,
        top: 82,
        bottom: bottomBoxHeight + 20,
      };
      if (viewport.width) {
        try {
          const newVp = new WebMercatorViewport(viewport).fitBounds(bbox, { padding, maxZoom: 10 });
          this.setState({ viewport: newVp });
        } catch (err) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'nav_flymarkers_viewport' });
        }
      }
    }
  }

  focus(ev) {
    if (!this.state.hasFocus && (!ev || !ev.srcEvent || !ev.srcEvent.path || !this.mapContainerRef.current
      || ev.srcEvent.path.includes(this.mapContainerRef.current))) {
      this.setState({ hasFocus: true });
    }
  }

  itemLoc(item) {
    if (item.access && item.access.length) {
      return item.access[0];
    }
    return item.position;
  }

  itemLngLat(item, bounds = false) {
    const pos = this.itemLoc(item);
    const res = [pos.lng, pos.lat];
    return bounds ? [res, res] : res;
  }

  toggleCarPinTooltip(visible) {
    const tooltip = this.carPinTooltipRef.current;
    if (tooltip) {
      tooltip.style.display = visible ? 'block' : 'none';
    }
  }

  async researchArea() {
    this.searchController?.abort();
    const request = new AbortController();
    this.searchController = request;
    const { viewport } = this.state;
    try {
      const search = await forwardLookup(this.searchInputRef.current.value, [viewport.longitude, viewport.latitude], request.signal);
      if (this.mounted && !request.signal.aborted) this.setState({ search, searchLooking: false, noFly: true });
    } catch {
      if (this.mounted && !request.signal.aborted) this.setState({ navError: 'Could not search this area. Please try again.' });
    }
  }

  viewportChange(viewport, interactionState = {}) {
    const { search, searchSelect, searchLooking } = this.state;
    this.setState({ viewport });

    if (interactionState.isPanning || interactionState.isZooming || interactionState.isRotating) {
      this.focus();

      if (search && !searchSelect && !searchLooking) {
        this.setState({ searchLooking: true, noFly: true });
      }
    }
  }

  carLocationCircle(carLocation) {
    const points = 128;
    const km = carLocation.accuracy / 1000;

    const distanceX = km / (111.320 * Math.cos(carLocation.location[1] * (Math.PI / 180)));
    const distanceY = km / 110.574;

    const res = [];
    let theta; let x; let
      y;
    for (let i = 0; i < points; i++) {
      theta = (i / points) * (2 * Math.PI);
      x = distanceX * Math.cos(theta);
      y = distanceY * Math.sin(theta);

      res.push([carLocation.location[0] + x, carLocation.location[1] + y]);
    }
    res.push(res[0]);

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [res],
        },
      }],
    };
  }

  onContainerRef(el) {
    this.mapContainerRef.current = el;
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  }

  render() {
    const { classes } = this.props;
    const {
      mapError, hasFocus, search, searchSelect, viewport, windowWidth,
    } = this.state;
    const carLocation = this.getCarLocation();

    const cardStyle = windowWidth < 600
      ? { zIndex: 4, width: 'auto', height: 'auto', top: 'auto', bottom: 'auto', left: 10, right: 10 }
      : { zIndex: 4, width: 360, height: 'auto', top: 'auto', bottom: 'auto', left: 10 };

    let carPinTooltipStyle = { transform: 'translate(calc(-50% + 10px), -4px)' };
    if (carLocation) {
      const pixelsAvailable = viewport.height - new WebMercatorViewport(viewport).project(carLocation.location)[1];
      if (pixelsAvailable < 50) {
        carPinTooltipStyle = { transform: 'translate(calc(-50% + 10px), -81px)' };
      }
    }

    return (
      <div
        ref={this.onContainerRef}
        className={classes.mapContainer}
        style={{ height: hasFocus ? '60vh' : 200 }}
      >
        <VisibilityHandler onVisible={this.updateDevice} onInit onDongleId minInterval={60} />
        {mapError
          && (
            <div className={classes.mapError}>
              <Typography>Could not initialize map.</Typography>
              <Typography>{mapError}</Typography>
            </div>
          )}
        <ReactMapGL
          latitude={viewport.latitude}
          longitude={viewport.longitude}
          zoom={viewport.zoom}
          bearing={viewport.bearing}
          pitch={viewport.pitch}
          onViewportChange={this.viewportChange}
          onContextMenu={null}
          mapStyle={MAPBOX_STYLE}
          width="100%"
          height="100%"
          onNativeClick={this.focus}
          maxPitch={0}
          mapboxApiAccessToken={MAPBOX_TOKEN}
          attributionControl={false}
          dragRotate={false}
          onError={(err) => this.setState({ mapError: err.error.message })}
        >
          <GeolocateControl
            className={classes.geolocateControl}
            positionOptions={{ enableHighAccuracy: true }}
            showAccuracyCircle={false}
            onGeolocate={this.onGeolocate}
            auto={hasFocus}
            fitBoundsOptions={{ maxZoom: 10 }}
            trackUserLocation
            onViewportChange={() => { }}
          />
          {searchSelect?.route && <Source id="navigation-route" type="geojson" data={searchSelect.route.geometry}>
            <Layer type="line" layout={{ 'line-cap': 'round', 'line-join': 'bevel' }}
              paint={{ 'line-color': '#31a1ee', 'line-width': 3, 'line-blur': 1 }} />
          </Source>}
          {(searchSelect && searchSelect.resultType !== 'car' ? [searchSelect] : search || []).map(item => (
            <Marker key={item.id} latitude={item.position.lat} longitude={item.position.lng} offsetLeft={-10} offsetTop={-30}>
              <PinMarkerIcon className={classes.pin} onClick={() => this.onSearchSelect(item)}
                alt={item.title} style={{ cursor: 'pointer' }} />
            </Marker>
          ))}
          <HTMLOverlay redraw={this.renderOverlay} captureScroll captureDrag captureClick captureDoubleClick capturePointerMove
            style={{ ...cardStyle, top: 10 }} />
          {carLocation
            && (
              <Marker
                latitude={carLocation.location[1]}
                longitude={carLocation.location[0]}
                offsetLeft={-10}
                offsetTop={-30}
                captureDrag={false}
                captureClick
                captureDoubleClick={false}
              >
                <PinCarIcon
                  className={classes.pin}
                  onMouseEnter={() => this.toggleCarPinTooltip(true)}
                  onMouseLeave={() => this.toggleCarPinTooltip(false)}
                  alt="car-location"
                  onClick={() => this.onCarSelect(carLocation)}
                />
                <div
                  className={classes.carPinTooltip}
                  ref={this.carPinTooltipRef}
                  style={{ ...carPinTooltipStyle, display: 'none' }}
                >
                  {dayjs(carLocation.time).format('h:mm A')}
                  ,
                  <br />
                  {timeFromNow(carLocation.time)}
                </div>
              </Marker>
            )}
          {carLocation && Boolean(carLocation.accuracy)
            && (
              <Source type="geojson" data={this.carLocationCircle(carLocation)}>
                <Layer
                  id="polygon"
                  type="fill"
                  source="polygon"
                  layout={{}}
                  paint={{ 'fill-color': '#31a1ee', 'fill-opacity': 0.3 }}
                />
              </Source>
            )}
          {this.state.searchLooking && !searchSelect && <HTMLOverlay
            redraw={() => <Button className={classes.researchArea} onClick={this.researchArea}>search this area</Button>}
            captureScroll captureDrag captureClick captureDoubleClick capturePointerMove
            style={{ ...cardStyle, width: 180, top: 10, left: 'auto', right: 10 }} />}
          {searchSelect
            && (
              <HTMLOverlay
                redraw={this.renderSearchOverlay}
                captureScroll
                captureDrag
                captureClick
                captureDoubleClick
                capturePointerMove
                style={{ ...cardStyle, bottom: 10 }}
              />
            )}
        </ReactMapGL>
      </div>
    );
  }

  renderOverlay() {
    const { classes } = this.props;
    const { search, searchSelect, searchLooking, geoLocateCoords } = this.state;
    const carLocation = this.getCarLocation();

    return (
      <div
        className={ classes.overlay }

        tabIndex={ -1 }

        onClick={ this.focus }
      >
        <TextField
          onChange={ this.onSearch }
          fullWidth
          inputRef={ this.searchInputRef }
          placeholder="where do you want to go?"
          InputProps={{
            onFocus: this.onFocus,

            classes: { root: classes.overlayTextfield },
            endAdornment: <>
              { this.searchInputRef.current && this.searchInputRef.current.value
                && (
                <InputAdornment position="end">
                  <Clear className={ classes.overlayClearButton } onClick={ this.clearSearch } />
                </InputAdornment>
                )}
              <InputAdornment position="end">
                <svg width="24" height="24" viewBox="0 0 24 24" className={classes.overlaySearchButton}><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m15 15 6 6" stroke="currentColor" strokeWidth="2" /></svg>
              </InputAdornment>
            </>,
          }}
        />
        {this.state.navError && <Typography role="alert" className={classes.overlaySearchNoLocation}>{this.state.navError}</Typography>}
        { search && !searchSelect && !searchLooking && (
        <>
          <div className={ classes.overlaySearchResultsHr } />
          <div className={ `${classes.overlaySearchResults} scrollstyle` }>
            { !geoLocateCoords && !carLocation
              && (
              <Typography className={ classes.overlaySearchNoLocation }>
                location unknown, turn on device for better results
              </Typography>
              ) }
            { search.length === 0
              && <Typography className={ classes.overlaySearchNoResults }>no search results</Typography> }
            { search.map((item) => (
              <div key={ item.id } className={ classes.overlaySearchItem } onClick={ () => this.onSearchSelect(item) }>
                <Typography>
                  { Utils.formatPlaceName(item) }
                  <span className={ classes.overlaySearchDetails }>
                    { Utils.formatSearchList(item) }
                  </span>
                </Typography>
              </div>
            )) }
          </div>
        </>
        ) }
      </div>
    );
  }

  renderSearchOverlay() {
    const { classes, device } = this.props;
    const { searchSelect } = this.state;

    const carLocation = this.getCarLocation();

    const isCar = searchSelect.resultType === 'car';
    const title = isCar ? device.alias : Utils.formatPlaceName(searchSelect);
    const { lat, lng } = searchSelect.position;

    let geoUri;
    if (isIos()) {
      geoUri = `https://maps.apple.com/?ll=${lat},${lng}&q=${title}`;
    } else {
      geoUri = `https://maps.google.com/?q=${lat},${lng}`;
    }

    return (
      <div className={classes.searchSelectBox} ref={this.searchSelectBoxRef}>
        <Clear className={classes.clearSearchSelect} onClick={this.clearSearchSelect} />
        <div className={classes.searchSelectBoxHeader}>
          <div className={classes.searchSelectBoxTitle}>
            <Typography className={classes.bold}>{title}</Typography>
            {isCar && carLocation && <Typography className={classes.searchSelectBoxDetails}>{timeFromNow(carLocation.time)}</Typography>}
            {searchSelect.route && <Typography className={classes.searchSelectBoxDetails}>
              {Utils.formatRouteDistance(searchSelect.route)} ({Utils.formatRouteDuration(searchSelect.route)})
            </Typography>}
          </div>
          <div className={classes.searchSelectBoxButtons}>
            <Button classes={{ root: isCar ? classes.searchSelectButton : classes.searchSelectButtonSecondary }} target="_blank" href={geoUri}>
              open in maps
            </Button>
            {!isCar && <Button onClick={this.navigate} classes={{ root: classes.searchSelectButton }}
              disabled={!device.prime || !deviceIsOnline(device) || searchSelect.settingDest || searchSelect.success}>
              {searchSelect.success ? 'destination set' : searchSelect.settingDest ? 'setting destination...' : 'navigate'}
            </Button>}
          </div>
        </div>
        <Typography className={classes.searchSelectBoxDetails}>
          {isCar && `${Utils.formatPlaceName(searchSelect)}, `}
          {Utils.formatPlaceAddress(searchSelect, 'state')}
        </Typography>
        {!isCar && !device.prime && <Typography className={classes.searchSelectBoxDetails}>comma prime is required to navigate</Typography>}
        {!isCar && device.prime && !deviceIsOnline(device) && <Typography className={classes.searchSelectBoxDetails}>turn on device to navigate</Typography>}
      </div>
    );
  }

}

const stateToProps = (state) => ({
  device: state.device,
  dongleId: state.dongleId,
});

export default connect(stateToProps)(withStyles(styles)(Navigation));
