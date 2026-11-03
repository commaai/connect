import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, Source, WebMercatorViewport, Layer } from 'react-map-gl';
import dayjs from 'dayjs';

import { api } from '../../api/backend';
import { athena } from '../../api';
import { analyticsEvent } from '../../actions';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN, reverseLookup, forwardLookup, getDirections } from '../../utils/geocode';
import { Clear, PinCarIcon, PinMarkerIcon } from '../../icons';
import { deviceIsOnline, timeFromNow } from '../../utils';
import VisibilityHandler from '../VisibilityHandler';
import { subscribeWindowSize } from '../../hooks/window';
import * as Utils from './utils';
import { isIos } from '../../utils/browser.js';

// MUI Button/Typography base styles, kept so the converted elements look the same
const buttonBase = 'inline-flex items-center justify-center box-border min-w-16 cursor-pointer select-none no-underline '
  + 'text-sm font-medium leading-[1.75] tracking-[0.02857em] transition-colors disabled:pointer-events-none';
const text = 'm-0 text-base leading-normal tracking-[0.00938em]';
const searchSelectButtonBase = `${buttonBase} ml-2 grow max-w-[125px] rounded-[15px] px-3`;
const searchSelectButton = `${searchSelectButtonBase} py-1.5 bg-white text-[#1e2224]
  hover:bg-[#ddd] hover:text-[#1e2224] disabled:bg-[#ddd] disabled:text-[#1e2224]`;
const searchSelectButtonSecondary = `${searchSelectButtonBase} py-[4.5px] text-white border-[1.5px] border-white/50
  hover:bg-white/8 disabled:border-white/20 disabled:text-white/30`;
const inputAdornment = 'ml-2 flex h-[0.01em] max-h-[2em] items-center whitespace-nowrap';

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

  async getSearchLocation() {
    const location = this.state.geoLocateCoords || this.getCarLocation()?.location;
    if (location) return location;
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('location unavailable'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 60000, timeout: 5000 });
    });
    const coords = [pos.coords.longitude, pos.coords.latitude];
    if (this.mounted) this.setState({ geoLocateCoords: coords });
    return coords;
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
      try {
        const proximity = await this.getSearchLocation();
        if (request.signal.aborted || !this.mounted) return;
        const search = await forwardLookup(query, proximity, request.signal);
        if (this.mounted && !request.signal.aborted) this.setState({ search, noFly: false, searchLooking: false });
      } catch {
        if (this.mounted && !request.signal.aborted) this.setState({ search: null, navError: this.state.geoLocateCoords || this.getCarLocation()
          ? 'Could not search for places. Please try again.' : 'Allow location access or turn on your device to find nearby places.' });
      }
    }, 400);
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

    if (searchSelect && viewport.width && viewport.height) {
      const mapViewport = new WebMercatorViewport(viewport);
      const [x, y] = mapViewport.project(this.itemLngLat(searchSelect));
      const cardHeight = this.searchSelectBoxRef.current?.getBoundingClientRect().height || 0;
      const targetX = Math.max(20, Math.min(viewport.width - 20, x));
      const targetY = Math.max(82, Math.min(viewport.height - cardHeight - 30, y));
      if (targetX !== x || targetY !== y) {
        const [longitude, latitude] = mapViewport.unproject([
          viewport.width / 2 + x - targetX, viewport.height / 2 + y - targetY,
        ]);
        this.setState({ viewport: { ...viewport, longitude, latitude } });
      }
      return;
    }

    const bounds = [];
    if (geoLocateCoords && (!search || searchSelect)) {
      bounds.push([geoLocateCoords, geoLocateCoords]);
    }
    if (carLocation && (!search || searchSelect)) {
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
          const newVp = new WebMercatorViewport(viewport).fitBounds(bbox, { padding, maxZoom: 16 });
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
        className="border-b border-white/10"
        style={{ height: hasFocus ? '60vh' : 200 }}
      >
        <VisibilityHandler onVisible={this.updateDevice} onInit onDongleId minInterval={60} />
        {mapError
          && (
            <div className="relative mt-5 ml-5">
              <p className={`${text} text-white/50`}>Could not initialize map.</p>
              <p className={`${text} text-white/50`}>{mapError}</p>
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
            className="hidden"
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
              <PinMarkerIcon className="h-8 w-5" onClick={() => this.onSearchSelect(item)}
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
                  className="h-8 w-5"
                  onMouseEnter={() => this.toggleCarPinTooltip(true)}
                  onMouseLeave={() => this.toggleCarPinTooltip(false)}
                  alt="car-location"
                  onClick={() => this.onCarSelect(carLocation)}
                />
                <div
                  className="rounded-[14px] border border-white/10 bg-[#272c2f] px-2 py-1.5 text-center text-[0.8em] text-white"
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
            redraw={() => (
              <button type="button" onClick={this.researchArea}
                className={`${buttonBase} w-full rounded-[18px] border border-white/10 bg-[#272c2f] px-4 py-1.5 text-white hover:bg-[#1e2224] [&_svg]:mr-1.5`}>
                search this area
              </button>
            )}
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
    const { search, searchSelect, searchLooking, geoLocateCoords } = this.state;
    const carLocation = this.getCarLocation();

    return (
      <div
        className="flex max-h-[calc(60vh-100px)] flex-col rounded-[22px] border border-white/10 bg-[#272c2f] px-4 py-3 text-white outline-none"

        tabIndex={ -1 }

        onClick={ this.focus }
      >
        <div className="relative box-border inline-flex w-full cursor-text items-center overflow-hidden border border-[#272c2f] text-base leading-[1.1876em] text-white">
          <input
            type="text"
            onChange={ this.onSearch }
            onFocus={ this.onFocus }
            ref={ this.searchInputRef }
            placeholder="where do you want to go?"
            className="m-0 block h-6 w-full min-w-0 border-0 bg-transparent p-0 text-inherit [font:inherit] outline-none placeholder:text-white/30 placeholder:opacity-100 focus:shadow-none focus:outline-none"
          />
          { this.searchInputRef.current && this.searchInputRef.current.value
            && (
            <div className={ inputAdornment }>
              <Clear className="cursor-pointer text-white/30" onClick={ this.clearSearch } />
            </div>
            )}
          <div className={ inputAdornment }>
            <svg width="24" height="24" viewBox="0 0 24 24" className="text-white/30"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m15 15 6 6" stroke="currentColor" strokeWidth="2" /></svg>
          </div>
        </div>
        {this.state.navError && <p role="alert" className={`${text} mt-2.5 text-sm text-[#c96722]`}>{this.state.navError}</p>}
        { search && !searchSelect && !searchLooking && (
        <>
          <div className="mt-0.5 border-t border-white/20" />
          <div className="scrollstyle mt-[3px] grow overflow-y-auto pr-[3px] [&::-webkit-scrollbar-thumb]:bg-white/20">
            { !geoLocateCoords && !carLocation
              && (
              <p className={ `${text} mt-2.5 text-sm text-[#c96722]` }>
                location unknown, turn on device for better results
              </p>
              ) }
            { search.length === 0
              && <p className={ `${text} mt-2.5 text-sm` }>no search results</p> }
            { search.map((item) => (
              <div key={ item.id } className="mt-[15px] cursor-pointer first:mt-2.5" onClick={ () => this.onSearchSelect(item) }>
                <p className={ text }>
                  { Utils.formatPlaceName(item) }
                  <span className="text-white/40">
                    { Utils.formatSearchList(item) }
                  </span>
                </p>
              </div>
            )) }
          </div>
        </>
        ) }
      </div>
    );
  }

  renderSearchOverlay() {
    const { device } = this.props;
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
      <div className="flex flex-col rounded-[22px] border border-white/10 bg-[#272c2f] px-4 py-3 text-white" ref={this.searchSelectBoxRef}>
        <Clear className="absolute -top-2 -left-1.5 size-6 cursor-pointer rounded-xl border border-[#394044] bg-[#1e2224] p-[5px] text-xl text-white hover:bg-[#303639]" onClick={this.clearSearchSelect} />
        <div className="mb-2.5 flex w-full items-start justify-between">
          <div className="basis-auto">
            <p className={`${text} font-semibold`}>{title}</p>
            {isCar && carLocation && <p className={`${text} text-white/40`}>{timeFromNow(carLocation.time)}</p>}
            {searchSelect.route && <p className={`${text} text-white/40`}>
              {Utils.formatRouteDistance(searchSelect.route)} ({Utils.formatRouteDuration(searchSelect.route)})
            </p>}
          </div>
          <div className="flex flex-wrap-reverse items-end justify-end">
            <a className={isCar ? searchSelectButton : searchSelectButtonSecondary} target="_blank" rel="noopener noreferrer" href={geoUri}>
              open in maps
            </a>
            {!isCar && <button type="button" onClick={this.navigate} className={searchSelectButton}
              disabled={!device.prime || !deviceIsOnline(device) || searchSelect.settingDest || searchSelect.success}>
              {searchSelect.success ? 'destination set' : searchSelect.settingDest ? 'setting destination...' : 'navigate'}
            </button>}
          </div>
        </div>
        <p className={`${text} text-white/40`}>
          {isCar && `${Utils.formatPlaceName(searchSelect)}, `}
          {Utils.formatPlaceAddress(searchSelect, 'state')}
        </p>
        {!isCar && !device.prime && <p className={`${text} text-white/40`}>comma prime is required to navigate</p>}
        {!isCar && device.prime && !deviceIsOnline(device) && <p className={`${text} text-white/40`}>turn on device to navigate</p>}
      </div>
    );
  }

}

const stateToProps = (state) => ({
  device: state.device,
  dongleId: state.dongleId,
});

export default connect(stateToProps)(Navigation);
