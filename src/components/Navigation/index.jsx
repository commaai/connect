import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, Source, WebMercatorViewport, Layer } from 'react-map-gl';
import { withStyles, Typography, Button } from '@material-ui/core';
import { Clear } from '@material-ui/icons';
import dayjs from 'dayjs';

import { athena as Athena, devices as Devices } from '@commaai/api';
import { primeNav, analyticsEvent } from '../../actions';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN, networkPositioning, reverseLookup } from '../../utils/geocode';
import Colors from '../../colors';
import { PinCarIcon } from '../../icons';
import { timeFromNow } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import * as Utils from './utils';

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
  primeAdTitle: {
    lineHeight: '31px',
    fontSize: 20,
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
  primeAdContainer: {
    backgroundColor: Colors.grey500,
    border: `1px solid ${Colors.grey700}`,
  },
  primeAdButton: {
    padding: '6px 24px',
    color: Colors.white,
    backgroundColor: Colors.primeBlue50,
    '&:hover': {
      color: Colors.white,
      backgroundColor: Colors.primeBlue200,
    },
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
  carNetworkLocation: null,
  carNetworkLocationAccuracy: null,
  geoLocateCoords: null,
  searchSelect: null,
  searchLooking: false,
  noFly: false,
  windowWidth: window.innerWidth,
  showPrimeAd: true,
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
    this.primeAdBoxRef = React.createRef();
    this.carPinTooltipRef = React.createRef();

    this.checkWebGLSupport = this.checkWebGLSupport.bind(this);
    this.flyToMarkers = this.flyToMarkers.bind(this);
    this.renderSearchOverlay = this.renderSearchOverlay.bind(this);
    this.renderPrimeAd = this.renderPrimeAd.bind(this);
    this.onGeolocate = this.onGeolocate.bind(this);
    this.onCarSelect = this.onCarSelect.bind(this);
    this.focus = this.focus.bind(this);
    this.updateDevice = this.updateDevice.bind(this);
    this.onResize = this.onResize.bind(this);
    this.toggleCarPinTooltip = this.toggleCarPinTooltip.bind(this);
    this.itemLoc = this.itemLoc.bind(this);
    this.itemLngLat = this.itemLngLat.bind(this);
    this.viewportChange = this.viewportChange.bind(this);
    this.getDeviceLastLocation = this.getDeviceLastLocation.bind(this);
    this.getDeviceNetworkLocation = this.getDeviceNetworkLocation.bind(this);
    this.getCarLocation = this.getCarLocation.bind(this);
    this.carLocationCircle = this.carLocationCircle.bind(this);
    this.clearSearchSelect = this.clearSearchSelect.bind(this);
    this.onContainerRef = this.onContainerRef.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
    this.checkWebGLSupport();
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { dongleId, device } = this.props;
    const { geoLocateCoords, search, carLastLocation, carNetworkLocation, searchSelect } = this.state;

    if ((carLastLocation && !prevState.carLastLocation) || (carNetworkLocation && !prevState.carNetworkLocation)
      || (geoLocateCoords && !prevState.geoLocateCoords) || (searchSelect && prevState.searchSelect !== searchSelect)
      || (search && prevState.search !== search)) {
      this.flyToMarkers();
    }

    if (prevProps.dongleId !== dongleId) {
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
        has_car_location: Boolean(carLastLocation || carNetworkLocation),
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
    this.getDeviceNetworkLocation();
  }

  async getDeviceLastLocation() {
    const { dongleId, device } = this.props;
    if (device.shared) {
      return;
    }
    try {
      const resp = await Devices.fetchLocation(dongleId);
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

  async getDeviceNetworkLocation() {
    const { dongleId } = this.props;

    const payload = {
      method: 'getNetworks',
      jsonrpc: '2.0',
      id: 0,
    };
    try {
      let resp = await Athena.postJsonRpcPayload(dongleId, payload);
      if (!resp.result || Object.keys(resp.result).length === 0 || !this.mounted || dongleId !== this.props.dongleId) {
        return;
      }
      resp = await networkPositioning(resp.result);
      if (resp && this.mounted && dongleId === this.props.dongleId) {
        this.setState({
          carNetworkLocation: [resp.lng, resp.lat],
          carNetworkLocationAccuracy: resp.accuracy,
        }, this.flyToMarkers);
      }
    } catch (err) {
      if (this.mounted && dongleId === this.props.dongleId
        && (!err.message || err.message.indexOf('{"error": "Device not registered"}') === -1)) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_fetch_network_location' });
      }
    }
  }

  getCarLocation() {
    const { carLastLocation, carLastLocationTime, carNetworkLocation, carNetworkLocationAccuracy } = this.state;

    if (carNetworkLocation && carNetworkLocationAccuracy <= 10000
      && (carNetworkLocationAccuracy <= 100 || !carLastLocation)) {
      return {
        location: carNetworkLocation,
        accuracy: carNetworkLocationAccuracy,
        time: Date.now(),
      };
    }
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

      let rightBoxWidth = 0;
      let topBoxHeight = 0;

      const primeAdBox = this.primeAdBoxRef.current;
      if (primeAdBox) {
        if (windowWidth < 600) {
          topBoxHeight = Math.max(topBoxHeight, primeAdBox.getBoundingClientRect().height + 10);
        } else {
          rightBoxWidth = primeAdBox.getBoundingClientRect().width + 10;
        }
      }

      const padding = {
        left: (windowWidth < 600 || !search) ? 20 : 390,
        right: rightBoxWidth + 20,
        top: topBoxHeight + 20,
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

  onResize(windowWidth) {
    this.setState({ windowWidth });
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
    const { classes, device } = this.props;
    const { mapError, hasFocus, searchSelect, viewport, windowWidth, showPrimeAd } = this.state;
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
        style={{ height: 200 }}
      >
        <ResizeHandler onResize={this.onResize} />
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
          {showPrimeAd && !device.prime && device.is_owner
            && (
              <HTMLOverlay
                redraw={this.renderPrimeAd}
                captureScroll
                captureDrag
                captureClick
                captureDoubleClick
                capturePointerMove
                style={{ ...cardStyle, top: 10, left: windowWidth < 600 ? 10 : 'auto', right: 10 }}
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

    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const title = device.alias;
    const { lat, lng } = searchSelect.position;

    let geoUri;
    if (isIos) {
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

  renderPrimeAd() {
    const { classes } = this.props;

    return (
      <div className={`${classes.searchSelectBox} ${classes.primeAdContainer}`} ref={this.primeAdBoxRef}>
        <Clear
          className={classes.clearSearchSelect}
          onClick={() => this.setState({ showPrimeAd: false }, this.flyToMarkers)}
        />
        <div className={classes.searchSelectBoxHeader}>
          <div className={classes.searchSelectBoxTitle}>
            <Typography className={classes.primeAdTitle}>comma prime</Typography>
          </div>
          <div className={classes.searchSelectBoxButtons}>
            <Button
              onClick={() => this.props.dispatch(primeNav(true))}
              className={`${classes.searchSelectButton} ${classes.primeAdButton} primeSignUp`}
            >
              sign up
            </Button>
          </div>
        </div>
        <Typography className={classes.primeAdDetails}>
          Put your car on the internet with comma prime
        </Typography>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  device: 'device',
  dongleId: 'dongleId',
});

export default connect(stateToProps)(withStyles(styles)(Navigation));
