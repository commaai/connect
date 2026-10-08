import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, Source, WebMercatorViewport, Layer } from 'react-map-gl';
import { withStyles, Typography, Button } from '@material-ui/core';
import dayjs from 'dayjs';

import { api } from '../../api/backend';
import { analyticsEvent } from '../../actions';
import { fetchDriveCoords } from '../../actions/cached';
import { getRouteFeatureCollection, getRoutesBounds } from '../DriveMap';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN, reverseLookup } from '../../utils/geocode';
import Colors from '../../colors';
import { Clear, PinCarIcon } from '../../icons';
import { timeFromNow } from '../../utils';
import VisibilityHandler from '../VisibilityHandler';
import { subscribeWindowSize } from '../../hooks/window';
import * as Utils from './utils';
import { isIos } from '../../utils/browser.js';

const styles = () => ({
  mapContainer: {
    position: 'sticky',
    top: 64,
    zIndex: 12,
    height: 'var(--dashboard-map-height, 50vh)',
    flexShrink: 0,
    borderBottom: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey900,
    '@media (max-width: 639px)': {
      top: 64,
    },
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
  searchSelect: null,
  searchLooking: false,
  noFly: false,
  windowWidth: window.innerWidth,
};

export class Navigation extends Component {
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
    this.carPinTooltipRef = React.createRef();

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
    this.onMapRef = this.onMapRef.bind(this);
    this.onMapLoad = this.onMapLoad.bind(this);
    this.syncRouteMap = this.syncRouteMap.bind(this);
    this.fetchNextRouteCoords = this.fetchNextRouteCoords.bind(this);
    this.fitRoutes = this.fitRoutes.bind(this);

    this.map = null;
    this.routeSignature = '';
    this.routeCoordQueue = [];
    this.requestedRouteCoords = new Set();
    this.activeRouteCoordRequests = 0;
    this.hasUserInteractedWithMap = false;
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
    const { dongleId, device, routes, lastRoutes } = this.props;
    const { geoLocateCoords, search, carLastLocation, searchSelect } = this.state;
    const prevRoutes = prevProps.routes || prevProps.lastRoutes || [];
    const displayRoutes = routes || lastRoutes || [];
    const routeSignature = this.getRouteSignature(displayRoutes);

    if (routeSignature !== this.routeSignature || Boolean(routes) !== Boolean(prevProps.routes)) {
      this.syncRouteMap();
    } else if (this.haveRouteCoordinatesChanged(prevRoutes, displayRoutes)) {
      this.fitRoutes();
    }

    if ((carLastLocation && !prevState.carLastLocation)
      || (geoLocateCoords && !prevState.geoLocateCoords) || (searchSelect && prevState.searchSelect !== searchSelect)
      || (search && prevState.search !== search)) {
      this.flyToMarkers();
    }

    if (prevProps.dongleId !== dongleId) {
      this.hasUserInteractedWithMap = false;
      this.routeSignature = '';
      this.requestedRouteCoords.clear();
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
    if (this.map && typeof this.map.off === 'function') {
      this.map.off('load', this.onMapLoad);
    }
  }

  getDisplayRoutes() {
    return [...(this.props.routes || this.props.lastRoutes || [])]
      .sort((a, b) => b.start_time_utc_millis - a.start_time_utc_millis);
  }

  getRouteSignature(routes) {
    return routes.map((route) => route.fullname).sort().join(',');
  }

  haveRouteCoordinatesChanged(previousRoutes, routes) {
    return routes.some((route, index) => (
      route.fullname !== previousRoutes[index]?.fullname
      || route.driveCoords !== previousRoutes[index]?.driveCoords
    ));
  }

  syncRouteMap() {
    const routes = this.getDisplayRoutes();
    this.routeSignature = this.getRouteSignature(routes);
    this.routeCoordQueue = this.props.routes ? routes.filter((route) => (
      !route.driveCoords
      && typeof route.url === 'string'
      && Number.isInteger(route.maxqlog)
      && route.maxqlog >= 0
      && !this.requestedRouteCoords.has(route.fullname)
    )) : [];
    this.fetchNextRouteCoords();
  }

  fetchNextRouteCoords() {
    if (!this.mounted) {
      return;
    }
    while (this.activeRouteCoordRequests < 2 && this.routeCoordQueue.length > 0) {
      const route = this.routeCoordQueue.shift();
      this.requestedRouteCoords.add(route.fullname);
      this.activeRouteCoordRequests += 1;
      Promise.resolve(this.props.dispatch(fetchDriveCoords(route)))
        .catch((error) => {
          this.requestedRouteCoords.delete(route.fullname);
          console.error(`Unable to load dashboard map coordinates for ${route.fullname}`, error);
        })
        .finally(() => {
          this.activeRouteCoordRequests -= 1;
          if (this.getRouteSignature(this.getDisplayRoutes()) === this.routeSignature) {
            this.fetchNextRouteCoords();
          }
        });
    }
    if (this.routeCoordQueue.length === 0 && this.activeRouteCoordRequests === 0) {
      this.fitRoutes();
    }
  }

  fitRoutes() {
    if (this.hasUserInteractedWithMap || !this.map || !this.map.loaded()) {
      return;
    }
    const bounds = getRoutesBounds(this.getDisplayRoutes());
    if (!bounds) {
      return;
    }
    if (bounds[0][0] === bounds[1][0]) {
      bounds[0][0] -= 0.001;
      bounds[1][0] += 0.001;
    }
    if (bounds[0][1] === bounds[1][1]) {
      bounds[0][1] -= 0.001;
      bounds[1][1] += 0.001;
    }
    this.map.fitBounds(bounds, { padding: 24, maxZoom: 10, duration: 0 });
  }

  onMapRef(mapComponent) {
    this.map = mapComponent && typeof mapComponent.getMap === 'function'
      ? mapComponent.getMap()
      : null;
    if (!this.map) {
      return;
    }
    if (this.map.loaded()) {
      this.fitRoutes();
    } else {
      this.map.once('load', this.onMapLoad);
    }
  }

  onMapLoad() {
    this.fitRoutes();
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

  onCarSelect(carLocation) {
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
    this.setState({
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
    if (carLocation && !this.hasUserInteractedWithMap) {
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
        top: 20,
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

  viewportChange(viewport, interactionState) {
    const { search, searchSelect, searchLooking } = this.state;
    this.setState({ viewport });

    if (interactionState?.isPanning || interactionState?.isZooming || interactionState?.isRotating) {
      this.hasUserInteractedWithMap = true;
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
      mapError, hasFocus, searchSelect, viewport, windowWidth,
    } = this.state;
    const carLocation = this.getCarLocation();
    const routes = this.getDisplayRoutes();

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
          ref={this.onMapRef}
          attributionControl={false}
          dragRotate={false}
          onError={(err) => this.setState({ mapError: err.error.message })}
        >
          <Source
            id="dashboard-routes"
            type="geojson"
            data={getRouteFeatureCollection(routes)}
          >
            <Layer
              id="dashboard-route-lines"
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round',
              }}
              paint={{
                'line-color': '#55A9E8',
                'line-width': 3,
                'line-opacity': 0.8,
              }}
            />
          </Source>
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

  renderSearchOverlay() {
    const { classes, device } = this.props;
    const { searchSelect } = this.state;

    const carLocation = this.getCarLocation();

    const title = device.alias;
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
            <Typography className={classes.searchSelectBoxDetails}>{timeFromNow(carLocation.time)}</Typography>
          </div>
          <div className={classes.searchSelectBoxButtons}>
            <Button classes={{ root: classes.searchSelectButton }} target="_blank" href={geoUri}>
              open in maps
            </Button>
          </div>
        </div>
        <Typography className={classes.searchSelectBoxDetails}>
          {Utils.formatPlaceName(searchSelect)}
          {Utils.formatPlaceAddress(searchSelect)}
        </Typography>
      </div>
    );
  }

}

const stateToProps = (state) => ({
  device: state.device,
  dongleId: state.dongleId,
  routes: state.routes,
  lastRoutes: state.lastRoutes,
});

export default connect(stateToProps)(withStyles(styles)(Navigation));
