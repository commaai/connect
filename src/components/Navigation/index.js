import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import debounce from 'debounce';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, Source, WebMercatorViewport, Layer} from 'react-map-gl';
import { withStyles, TextField, InputAdornment, Typography, Button, Menu, MenuItem, CircularProgress, Popper }
  from '@material-ui/core';
import { Search, Clear, Refresh } from '@material-ui/icons';
import fecha from 'fecha';

import { primeNav } from '../../actions';
import { timeFromNow } from '../../utils';
import { devices as Devices, navigation as NavigationAPI, athena as AthenaApi } from '@commaai/comma-api';
import Colors from '../../colors';
import GeocodeApi, { MAPBOX_TOKEN } from '../../api/geocode';
import { pin_car, pin_marker, pin_home, pin_work, pin_pinned } from '../../icons';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import * as Demo from '../../demo';

const MAP_STYLE = 'mapbox://styles/commaai/cjj4yzqk201c52ss60ebmow0w';
const styles = () => ({
  noWrap: {
    whiteSpace: 'nowrap',
  },
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
    marginTop: 5,
    borderTop: `1px solid ${Colors.white20}`,
    flexGrow: 1,
    overflow: 'auto',
  },
  overlaySearchItem: {
    cursor: 'pointer',
    marginTop: 15,
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
    color: '#404B4F',
    textTransform: 'none',
    minHeight: 'unset',
    flexGrow: 1,
    maxWidth: 125,
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
    background: '#ddd',
    minWidth: 81.4,
    textAlign: 'center',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    '& p': {
      color: '#404B4F',
      lineHeight: '1.4em',
      fontWeight: 500,
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
  pinClick: {
    width: 22.5,
    height: 32,
    cursor: 'pointer',
  },
  favoritePin: {
    width: 15,
    height: 24,
    cursor: 'pointer',
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
  saveAsMenuItem: {
    justifyContent: 'center',
  },
  savedNextPopover: {
    borderRadius: 22,
    padding: '8px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    marginTop: 5,
    textAlign: 'center',
    zIndex: 5,
    '& p:first-child': {
      fontWeight: 500,
    },
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
    }
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
  favoriteLocations: [],
  geoLocateCoords: null,
  search: null,
  route: null,
  searchSelect: null,
  searchLooking: false,
  noFly: false,
  windowWidth: window.innerWidth,
  saveAsMenu: null,
  savingAs: false,
  savedAs: false,
  showPrimeAd: true,
}

class Navigation extends Component {
  constructor(props) {
    super(props);
    this.mounted = null;
    this.state = {
      ...initialState,
      viewport: {
        longitude: -117.20,
        latitude: 32.73,
        zoom: 5,
      },
      mapError: null,
      windowWidth: window.innerWidth,
    };

    this.searchInputRef = React.createRef();
    this.searchSelectBoxRef = React.createRef();
    this.primeAdBoxRef = React.createRef();
    this.overlayRef = React.createRef();
    this.carPinTooltipRef = React.createRef();
    this.navigateFakeButtonRef = React.createRef();

    this.checkWebGLSupport = this.checkWebGLSupport.bind(this);
    this.flyToMarkers = this.flyToMarkers.bind(this);
    this.renderOverlay = this.renderOverlay.bind(this);
    this.renderSearchOverlay = this.renderSearchOverlay.bind(this);
    this.renderPrimeAd = this.renderPrimeAd.bind(this);
    this.renderResearchArea = this.renderResearchArea.bind(this);
    this.onGeolocate = this.onGeolocate.bind(this);
    this.onSearch = debounce(this.onSearch.bind(this), 200);
    this.onFocus = this.onFocus.bind(this);
    this.onSearchSelect = this.onSearchSelect.bind(this);
    this.researchArea = this.researchArea.bind(this);
    this.onFavoriteSelect = this.onFavoriteSelect.bind(this);
    this.onSearchBlur = this.onSearchBlur.bind(this);
    this.focus = this.focus.bind(this);
    this.updateDevice = this.updateDevice.bind(this);
    this.updateFavoriteLocations = this.updateFavoriteLocations.bind(this);
    this.getFavoriteLabelIcon = this.getFavoriteLabelIcon.bind(this);
    this.formatDistance = this.formatDistance.bind(this);
    this.formatDuration = this.formatDuration.bind(this);
    this.navigate = this.navigate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.toggleCarPinTooltip = this.toggleCarPinTooltip.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.formatSearchName = this.formatSearchName.bind(this);
    this.formatSearchDetails = this.formatSearchDetails.bind(this);
    this.itemLoc = this.itemLoc.bind(this);
    this.itemLngLat = this.itemLngLat.bind(this);
    this.saveSearchAs = this.saveSearchAs.bind(this);
    this.deleteFavorite = this.deleteFavorite.bind(this);
    this.viewportChange = this.viewportChange.bind(this);
    this.getDeviceLastLocation = this.getDeviceLastLocation.bind(this);
    this.getDeviceNetworkLocation = this.getDeviceNetworkLocation.bind(this);
    this.getCarLocation = this.getCarLocation.bind(this);
    this.carLocationCircle = this.carLocationCircle.bind(this);
    this.clearSearchSelect = this.clearSearchSelect.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
    this.checkWebGLSupport();
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { dongleId } = this.props;
    const { geoLocateCoords, search, carLastLocation, carNetworkLocation, searchSelect } = this.state;

    if ((carLastLocation && !prevState.carLastLocation) || (carNetworkLocation && !prevState.carNetworkLocation) ||
      (geoLocateCoords && !prevState.geoLocateCoords) || (searchSelect && prevState.searchSelect !== searchSelect) ||
      (search && prevState.search !== search))
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
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  checkWebGLSupport() {
    let canvas = document.createElement("canvas");
    let gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      this.setState({ mapError: 'Failed to get WebGL context, your browser or device may not support WebGL.' });
    }
  }

  updateDevice() {
    if (Demo.isDemo()) {
      return;
    }

    this.getDeviceLastLocation();
    this.getDeviceNetworkLocation();
    this.updateFavoriteLocations();
  }

  async getDeviceLastLocation() {
    const { dongleId } = this.props;
    try {
      const resp = await Devices.fetchLocation(dongleId);
      if (this.mounted && dongleId === this.props.dongleId) {
        this.setState({
          carLastLocation: [resp.lng, resp.lat],
          carLastLocationTime: resp.time,
        }, this.flyToMarkers);
      }
    } catch(err) {
      if (!err.message || err.message.indexOf('no_segments_uploaded') === -1) {
        console.log(err);
        Sentry.captureException(err);
      }
    }
  }

  async getDeviceNetworkLocation() {
    const { dongleId, hasNav } = this.props;
    if (!hasNav) {
      return;
    }

    const payload = {
      method: "getNetworks",
      jsonrpc: "2.0",
      id: 0,
    };
    try {
      let resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
      if (!resp.result || !this.mounted || dongleId !== this.props.dongleId) {
        return;
      }
      resp = await GeocodeApi().networkPositioning(resp.result);
      if (resp && this.mounted && dongleId === this.props.dongleId) {
        this.setState({
          carNetworkLocation: [resp.lng, resp.lat],
          carNetworkLocationAccuracy: resp.accuracy,
        }, this.flyToMarkers);
      }
    } catch (err) {
      if (this.mounted && dongleId === this.props.dongleId &&
        (!err.message || err.message.indexOf('{"error": "Device not registered"}') === -1))
      {
        console.log(err);
        Sentry.captureException(err);
      }
    }
  }

  getCarLocation() {
    const { carLastLocation, carLastLocationTime, carNetworkLocation, carNetworkLocationAccuracy } = this.state;

    if (carNetworkLocation && carNetworkLocationAccuracy <= 10000 &&
      (carNetworkLocationAccuracy <= 100 || !carLastLocation))
    {
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

  updateFavoriteLocations() {
    const { dongleId, hasNav } = this.props;
    if (!hasNav || Demo.isDemo()) {
      return;
    }

    NavigationAPI.getLocationsData(dongleId).then((resp) => {
      if (this.mounted && dongleId === this.props.dongleId) {
        let favorites = {};
        resp.forEach((loc) => {
          if (loc.save_type === 'favorite') {
            favorites[loc.id] = {
              ...loc,
              icon: this.getFavoriteLabelIcon(loc.label),
            };
          }
        });
        this.setState({ favoriteLocations: favorites });
      }
    }).catch(console.log);
  }

  getFavoriteLabelIcon(label) {
    switch (label) {
      case 'home':
        return pin_home;
      case 'work':
        return pin_work;
      default:
        return pin_pinned;
      }
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
      const vp = this.state.viewport;
      const carLoc = this.getCarLocation();
      const proximity = (carLoc ? carLoc.location : null) || this.state.geoLocateCoords || [vp.longitude, vp.latitude];
      GeocodeApi().forwardLookup(searchInput.value, proximity).then((features) => {
        this.setState({
          noFly: false,
          searchSelect: null,
          search: features.filter((item) =>
            !(['categoryQuery', 'chainQuery', 'administrativeArea'].includes(item.resultType))).slice(0, 10),
          searchLooking: false,
          savingAs: false,
          savedAs: false,
        });
      }).catch((err) => {
        console.log(err);
        Sentry.captureException(err);
      });
    } else {
      this.setState({
        noFly: false,
        searchSelect: null,
        search: null,
        searchLooking: false,
        savingAs: false,
        savedAs: false
      });
    }
  }

  onFocus() {
    const searchInput = this.searchInputRef.current;
    this.focus();
    if (searchInput && searchInput.value.length >= 3) {
      this.setState({
        noFly: false,
        searchSelect: null,
        searchLooking: false,
        savingAs: false,
        savedAs: false,
      }, this.flyToMarkers);
    } else {
      this.setState({
        noFly: false,
        searchSelect: null,
        search: null,
        searchLooking: false,
        savingAs: false,
        savedAs: false
      });
    }
  }

  onSearchSelect(item) {
    this.setState({
      noFly: false,
      searchSelect: item,
      searchLooking: false,
    });
    const carLoc = this.getCarLocation();
    const startLocation = (carLoc ? carLoc.location : null) || this.state.geoLocateCoords || null;
    if (startLocation) {
      GeocodeApi().getDirections([startLocation, this.itemLngLat(item)]).then((route) => {
        this.setState({
          searchSelect: {
            ...item,
            route: route[0],
          },
          searchLooking: false,
        });
      });
    }
  }

  onFavoriteSelect(id, loc) {
    this.focus();
    const item = {
      favoriteId: id,
      favoriteIcon: loc.icon,
      title: loc.place_name,
      address: {
        label: `${loc.place_name}, ${loc.place_details}`,
      },
      resultType: 'place',
      position: {
        lat: loc.latitude,
        lng: loc.longitude,
      },
    };
    this.onSearchSelect(item);
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
      this.searchInputRef.current.focus();
    }
    this.setState({
      noFly: false,
      search: null,
      route: null,
      searchSelect: null,
      searchLooking: false,
      savingAs: false,
      savedAs: false,
    });
  }

  clearSearchSelect() {
    this.setState({
      noFly: false,
      route: null,
      searchSelect: null,
      searchLooking: false,
      savingAs: false,
      savedAs: false,
    });
    this.onSearch();
  }

  flyToMarkers() {
    const { hasNav } = this.props;
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

      const bottomBoxHeight = (this.searchSelectBoxRef.current && viewport.height > 200) ?
        this.searchSelectBoxRef.current.getBoundingClientRect().height + 10 : 0;

      let rightBoxWidth = 0;
      let topBoxHeight = hasNav ? 62 : 0;

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
          const newVp = new WebMercatorViewport(viewport).fitBounds(bbox, { padding: padding, maxZoom: 10 });
          this.setState({ viewport: newVp });
        } catch (err) {
          console.log(err);
          Sentry.captureException(err);
        }
      }
    }
  }

  focus() {
    if (!this.state.hasFocus) {
      this.setState({ hasFocus: true });
    }
  }

  formatDistance(route) {
    const meters = route.distance;

    let metric = true;
    try {
      route.legs[0].admins.forEach((adm) => {
        if (['US', 'GB'].includes(adm.iso_3166_1)) {
          metric = false;
        }
      });
    } catch (err) {
      metric = false;
    }

    if (metric) {
      return (meters / 1000.0).toFixed(1) + " km";
    }
    return (meters / 1609.34).toFixed(1) + " mi";
  }

  formatDuration(route) {
    const seconds = route.duration;
    let mins = Math.round(seconds / 60.0);
    let res = '';
    if (mins >= 60) {
      const hours = Math.floor(mins / 60.0);
      mins -= hours * 60;
      res += `${hours} hr `;
    }
    return `${res}${mins} min`;
  }

  formatSearchName(item) {
    if (item.resultType === 'place') {
      return item.title;
    } else {
      return item.title.split(',', 1)[0];
    }
  }

  formatSearchDetails(item, comma=false) {
    const name = this.formatSearchName(item);
    const addrLabelName = item.address.label.split(',', 1)[0];
    let res;
    if (name.substr(0, addrLabelName.length) === addrLabelName) {
      res = item.address.label.split(', ').slice(1).join(', ');
    } else {
      res = item.address.label;
    }
    if (res.length) {
      return (comma ? ', ' : '') + res;
    }
  }

  itemLoc(item) {
    if (item.access && item.access.length) {
      return item.access[0];
    }
    return item.position;
  }

  itemLngLat(item, bounds=false) {
    const pos = this.itemLoc(item);
    const res = [pos.lng, pos.lat];
    return bounds ? [res, res] : res;
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

    const pos = this.itemLoc(searchSelect);
    NavigationAPI.setDestination(dongleId, pos.lat, pos.lng,
      this.formatSearchName(searchSelect), this.formatSearchDetails(searchSelect))
    .then((resp) => {
      if (resp.error) {
        throw new Error(resp.error);
      }

      this.setState({ searchSelect: {
        ...searchSelect,
        settingDest: true,
        success: resp.success,
        saved_next: resp.saved_next,
      }});
    }).catch((err) => {
      console.log(`failed to set destination: ${err.message}`);
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
      tooltip.style.display = visible ? 'block' : 'none';
    }
  }

  saveSearchAs(as) {
    const { dongleId } = this.props;
    const { searchSelect } = this.state;
    this.setState({ saveAsMenu: null, savingAs: true });

    const pos = this.itemLoc(searchSelect);
    const label = as === 'pin' ? undefined : as;
    NavigationAPI.putLocationSave(dongleId, pos.lat, pos.lng,
      this.formatSearchName(searchSelect), this.formatSearchDetails(searchSelect), 'favorite', label)
    .then((resp) => {
      this.updateFavoriteLocations();
      this.setState({
        savingAs: false,
        savedAs: true,
        searchSelect: {
          ...searchSelect,
          favoriteIcon: this.getFavoriteLabelIcon(label),
        },
      });
    }).catch((err) => {
      console.log(err);
      this.setState({ savingAs: false, savedAs: false });
    });
  }

  deleteFavorite() {
    const { dongleId } = this.props;
    const { searchSelect } = this.state;
    if (searchSelect.favoriteId) {
      this.setState({ savingAs: true });
      NavigationAPI.deleteLocationSave(dongleId, searchSelect.favoriteId).then((resp) => {
        this.updateFavoriteLocations();
        this.setState({
          noFly: false,
          route: null,
          searchSelect: null,
          searchLooking: false,
          savingAs: false,
          savedAs: false,
        }, this.flyToMarkers);
      }).catch((err) => {
        console.log(err);
        this.setState({ savingAs: false, savedAs: false });
      });
    }
  }

  researchArea() {
    const { viewport, windowWidth } = this.state;
    const searchInput = this.searchInputRef.current;

    GeocodeApi().forwardLookup(searchInput.value, null, viewport).then((features) => {
      this.setState({
        noFly: true,
        searchSelect: null,
        search: features.filter((item) =>
          !(['categoryQuery', 'chainQuery', 'administrativeArea'].includes(item.resultType))).slice(0, 10),
        searchLooking: windowWidth < 600,
        savingAs: false,
        savedAs: false,
      });
    }).catch((err) => {
      console.log(err);
      Sentry.captureException(err);
    });
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

    const distanceX = km / (111.320 * Math.cos(carLocation.location[1] * Math.PI / 180));
    const distanceY = km / 110.574;

    let res = [];
    let theta, x, y;
    for (let i = 0; i < points; i++) {
      theta = (i / points) * (2 * Math.PI);
      x = distanceX * Math.cos(theta);
      y = distanceY * Math.sin(theta);

      res.push([carLocation.location[0] + x, carLocation.location[1] + y]);
    }
    res.push(res[0]);

    return {
      "type": "FeatureCollection",
      "features": [{
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [res],
        }
      }],
    };
  };

  render() {
    const { classes, device, hasNav } = this.props;
    const { mapError, hasFocus, search, searchLooking, searchSelect, favoriteLocations, viewport,
      windowWidth, showPrimeAd } = this.state;
    const carLocation = this.getCarLocation();

    const cardStyle = windowWidth < 600 ?
      { zIndex: 4, width: 'auto', height: 'auto', top: 'auto', bottom: 'auto', left: 10, right: 10 } :
      { zIndex: 4, width: 360, height: 'auto', top: 'auto', bottom: 'auto', left: 10 };

    let carPinTooltipStyle = { transform: 'translate(calc(-50% + 10px), -4px)' };
    if (carLocation) {
      const pixelsAvailable = viewport.height - new WebMercatorViewport(viewport).project(carLocation.location)[1];
      if (pixelsAvailable < 50) {
        carPinTooltipStyle = { transform: 'translate(calc(-50% + 10px), -81px)' };
      }
    }

    return (
      <div className={ classes.mapContainer } style={{ height: (hasFocus && hasNav) ? '60vh' : 200 }}>
        <ResizeHandler onResize={ this.onResize } />
        <VisibilityHandler onVisible={ this.updateDevice } onInit={ true } onDongleId={ true } minInterval={ 60 } />
        { mapError &&
          <div className={ classes.mapError }>
            <Typography>Could not initialize map.</Typography>
            <Typography>{ mapError }</Typography>
          </div>
        }
        <ReactMapGL { ...viewport } onViewportChange={ this.viewportChange } onContextMenu={ null }
          mapStyle={ MAP_STYLE } width="100%" height="100%" onNativeClick={ this.focus } maxPitch={ 0 }
          mapboxApiAccessToken={ MAPBOX_TOKEN } attributionControl={ false } dragRotate={ false }
          onError={ (err) => this.setState({ mapError: err.error.message }) }>
          <GeolocateControl className={ classes.geolocateControl } positionOptions={{ enableHighAccuracy: true }}
            showAccuracyCircle={ false } onGeolocate={ this.onGeolocate } auto={ hasFocus }
            fitBoundsOptions={{ maxZoom: 10 }} trackUserLocation={true} onViewportChange={ () => {} } />
          { searchSelect && searchSelect.route &&
            <Source id="my-data" type="geojson" data={ searchSelect.route.geometry }>
              <Layer type="line" layout={{ 'line-cap': 'round', 'line-join': 'bevel' }}
                paint={{ 'line-color': '#31a1ee', 'line-width': 3, 'line-blur': 1 }}  />
            </Source>
          }
          { !search && !searchSelect && favoriteLocations && Object.entries(favoriteLocations).map(([id, loc]) =>
            <Marker latitude={ loc.latitude } longitude={ loc.longitude } key={ id } offsetLeft={ -7.5 }
              offsetTop={ -24 } captureDrag={ false } captureClick={ false } captureDoubleClick={ false }>
              <img className={ classes.favoritePin } src={ loc.icon } onClick={ () => this.onFavoriteSelect(id, loc) }
                alt="favorite-location" />
            </Marker>
          )}
          { carLocation &&
            <Marker latitude={ carLocation.location[1] } longitude={ carLocation.location[0] } offsetLeft={ -10 }
              offsetTop={ -30 } captureDrag={ false } captureClick={ true } captureDoubleClick={ false }>
              <img className={ classes.pin } src={ pin_car } onMouseEnter={ () => this.toggleCarPinTooltip(true) }
                onMouseLeave={ () => this.toggleCarPinTooltip(false) } alt="car-location" />
              <div className={ classes.carPinTooltip } ref={ this.carPinTooltipRef }
                style={{ ...carPinTooltipStyle, display: 'none' }}>
                { fecha.format(carLocation.time, 'h:mm a') },<br />{ timeFromNow(carLocation.time) }
              </div>
            </Marker>
          }
          { carLocation && Boolean(carLocation.accuracy) &&
            <Source type="geojson" data={ this.carLocationCircle(carLocation) }>
              <Layer id="polygon" type="fill" source="polygon" layout={{}}
                paint={{ 'fill-color': '#31a1ee', 'fill-opacity': 0.3 }} />
            </Source>
          }
          { search && !searchSelect && search.map((item) =>
            <Marker latitude={ this.itemLoc(item).lat } longitude={ this.itemLoc(item).lng } key={ item.id }
              offsetLeft={ -10 } offsetTop={ -30 } captureDrag={ false } captureClick={ false }
              captureDoubleClick={ false }>
              <img className={ classes.pinClick } src={ pin_marker } onClick={ () => this.onSearchSelect(item) }
                alt="pin-location" />
            </Marker>
          )}
          { searchSelect &&
            <Marker latitude={ this.itemLoc(searchSelect).lat } longitude={ this.itemLoc(searchSelect).lng }
              offsetLeft={ -10 } offsetTop={ -30 } captureDrag={ false } captureClick={ false }
              captureDoubleClick={ false }>
              <img className={ classes.pin } src={ searchSelect.favoriteIcon ? searchSelect.favoriteIcon : pin_marker }
                alt="pin-location" />
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
          { search && searchLooking && !searchSelect &&
            <HTMLOverlay redraw={ this.renderResearchArea } captureScroll={ true } captureDrag={ true }
              captureClick={ true } captureDoubleClick={ true } capturePointerMove={ true }
              style={{ ...cardStyle, bottom: 10, left: '50%', width: 180, transform: 'translate(-50%, 0)' }} />
          }
          { showPrimeAd && !hasNav && !device.prime && device.is_owner &&
            <HTMLOverlay redraw={ this.renderPrimeAd } captureScroll={ true } captureDrag={ true }
              captureClick={ true } captureDoubleClick={ true } capturePointerMove={ true }
              style={{ ...cardStyle, top: 10, left: windowWidth < 600 ? 10 : 'auto', right: 10 }} />
          }
        </ReactMapGL>
      </div>
    );
  }

  renderOverlay() {
    const { classes } = this.props;
    const { search, searchSelect, searchLooking, geoLocateCoords } = this.state;
    const carLocation = this.getCarLocation();

    return (
      <div className={ classes.overlay } ref={ this.overlayRef } tabIndex={ -1 } onBlur={ this.onSearchBlur }
        onClick={ this.focus }>
        <TextField onChange={ this.onSearch } fullWidth={ true } inputRef={ this.searchInputRef }
          placeholder="where do you want to go?"
          InputProps={{
            onFocus: this.onFocus,
            onBlur: this.onSearchBlur,
            classes: { root: classes.overlayTextfield },
            endAdornment: <>
              { this.searchInputRef.current && this.searchInputRef.current.value &&
                <InputAdornment position="end">
                  <Clear className={ classes.overlayClearButton } onClick={ this.clearSearch } />
                </InputAdornment>
              }
              <InputAdornment position="end"><Search className={ classes.overlaySearchButton } /></InputAdornment>
            </>
          }} />
        { search && !searchSelect && !searchLooking &&
          <div className={ `${classes.overlaySearchResults} scrollstyle` }>
            { !geoLocateCoords && !carLocation &&
              <Typography className={ classes.overlaySearchNoLocation }>
                location unknown, turn on device for better results
              </Typography> }
            { search.length === 0 &&
              <Typography className={ classes.overlaySearchNoResults }>no search results</Typography> }
            { search.map((item) => (
              <div key={ item.id } className={ classes.overlaySearchItem } onClick={ () => this.onSearchSelect(item) }>
                <Typography>
                  { this.formatSearchName(item) }
                  <span className={ classes.overlaySearchDetails }>
                    { this.formatSearchDetails(item, true) }
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
    const { classes, device } = this.props;
    const { searchSelect, geoLocateCoords, saveAsMenu, savingAs, savedAs } = this.state;
    const carLocation = this.getCarLocation();

    const noRoute = !searchSelect.route && (carLocation || geoLocateCoords);

    return (
      <div className={ classes.searchSelectBox } ref={ this.searchSelectBoxRef }>
        <Clear className={ classes.clearSearchSelect } onClick={ this.clearSearchSelect } />
        <div className={ classes.searchSelectBoxHeader }>
          <div className={ classes.searchSelectBoxTitle }>
            <Typography className={ classes.bold }>{ this.formatSearchName(searchSelect) }</Typography>
            { searchSelect.route &&
              <Typography className={ classes.searchSelectBoxDetails }>
                { this.formatDistance(searchSelect.route) } (
                { this.formatDuration(searchSelect.route) })
              </Typography>
            }
          </div>
          <div className={ classes.searchSelectBoxButtons }>
            { searchSelect.favoriteId ?
              <Button disabled={ savingAs || savedAs } onClick={ this.deleteFavorite }
                classes={{ root: classes.searchSelectButtonSecondary, label: classes.noWrap }}>
                { savingAs ? '...' : 'delete' }
              </Button>
            :
              <Button disabled={ savingAs || savedAs }
                onClick={ (ev) => this.setState({ saveAsMenu: ev.target }) }
                classes={{ root: classes.searchSelectButtonSecondary, label: classes.noWrap }}>
                { savingAs ? '...' : (savedAs ? 'saved' :  'save as') }
              </Button>
            }
            <Menu id="menu-save-as" open={ Boolean(saveAsMenu) } anchorEl={ saveAsMenu }
              onClose={ () => this.setState({ saveAsMenu: null }) }
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
              <MenuItem classes={{ root: classes.saveAsMenuItem }} onClick={ () => this.saveSearchAs('home') }>
                home
              </MenuItem>
              <MenuItem classes={{ root: classes.saveAsMenuItem }} onClick={ () => this.saveSearchAs('work') }>
                work
              </MenuItem>
              <MenuItem classes={{ root: classes.saveAsMenuItem }} onClick={ () => this.saveSearchAs('pin') }>
                favorite
              </MenuItem>
            </Menu>
            { searchSelect.settingDest ?
              <div className={ `${classes.searchSelectButton} ${classes.searchSelectButtonFake}` }
                ref={ this.navigateFakeButtonRef }>
                { searchSelect.success ?
                  <Typography>destination set</Typography> :
                  <CircularProgress size={ 19 } /> }
                <Popper open={ Boolean(searchSelect.success && searchSelect.saved_next) } placement="bottom"
                  anchorEl={ this.navigateFakeButtonRef.current } className={ classes.savedNextPopover }>
                  <Typography>device offline</Typography>
                  <Typography>destination will be set once device is online</Typography>
                </Popper>
              </div>
            :
              <Button disabled={ Boolean(noRoute) } onClick={ this.navigate }
                classes={{ root: classes.searchSelectButton }} style={{ marginBottom: 8 }}>
                { noRoute ? 'no route' : 'navigate' }
              </Button>
            }
          </div>
        </div>
        <Typography className={ classes.searchSelectBoxDetails }>
          { this.formatSearchDetails(searchSelect, false) }
        </Typography>
      </div>
    );
  }

  renderResearchArea() {
    const { classes } = this.props;

    return (
      <Button className={ classes.researchArea } onClick={ this.researchArea }>
        <Refresh />
        search this area
      </Button>
    );
  }

  renderPrimeAd() {
    const { classes} = this.props;

    return (
      <div className={ `${classes.searchSelectBox} ${classes.primeAdContainer}` } ref={ this.primeAdBoxRef }>
        <Clear className={ classes.clearSearchSelect }
          onClick={ () => this.setState({ showPrimeAd: false }, this.flyToMarkers) } />
        <div className={ classes.searchSelectBoxHeader }>
          <div className={ classes.searchSelectBoxTitle }>
            <Typography className={ classes.primeAdTitle }>comma prime</Typography>
          </div>
          <div className={ classes.searchSelectBoxButtons }>
            <Button onClick={ () => this.props.dispatch(primeNav()) }
              className={ `${classes.searchSelectButton} ${classes.primeAdButton}` }>
              sign up
            </Button>
          </div>
        </div>
        <Typography className={ classes.primeAdDetails }>
          Put your car on the internet with comma prime for $24/mo.
        </Typography>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  device: 'workerState.device',
  dongleId: 'workerState.dongleId',
});

export default connect(stateToProps)(withStyles(styles)(Navigation));
