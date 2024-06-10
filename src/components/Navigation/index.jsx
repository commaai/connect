import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import debounce from 'debounce';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, Source, WebMercatorViewport, Layer } from 'react-map-gl';
import { withStyles, TextField, InputAdornment, Typography, Button, Menu, MenuItem, CircularProgress, Popper }
  from '@material-ui/core';
import { Search, Clear, Refresh } from '@material-ui/icons';
import dayjs from 'dayjs';

import { athena as Athena, devices as Devices, navigation as NavigationApi } from '@commaai/api';
import { primeNav, analyticsEvent } from '../../actions';
import { DEFAULT_LOCATION, forwardLookup, getDirections, MAPBOX_STYLE, MAPBOX_TOKEN, networkPositioning, reverseLookup } from '../../utils/geocode';
import Colors from '../../colors';
import { PinCarIcon, PinMarkerIcon, PinHomeIcon, PinWorkIcon, PinPinnedIcon } from '../../icons';
import { timeFromNow } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import * as Utils from './utils';

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
  searchSelectButtonFake: {
    background: '#ddd',
    minWidth: 81.4,
    textAlign: 'center',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    '& p': {
      color: Colors.grey900,
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
  carNetworkLocation: null,
  carNetworkLocationAccuracy: null,
  favoriteLocations: [],
  geoLocateCoords: null,
  search: null,
  searchSelect: null,
  searchLooking: false,
  noFly: false,
  windowWidth: window.innerWidth,
  saveAsMenu: null,
  savingAs: false,
  savedAs: false,
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
    this.searchInputRef = React.createRef();
    this.searchSelectBoxRef = React.createRef();
    this.primeAdBoxRef = React.createRef();
    this.overlayRef = React.createRef();
    this.carPinTooltipRef = React.createRef();
    this.navigateFakeButtonRef = React.createRef();

    this.checkWebGLSupport = this.checkWebGLSupport.bind(this);
    this.flyToMarkers = this.flyToMarkers.bind(this);
    this.renderSearchSelectMarker = this.renderSearchSelectMarker.bind(this);
    this.renderOverlay = this.renderOverlay.bind(this);
    this.renderSearchOverlay = this.renderSearchOverlay.bind(this);
    this.renderPrimeAd = this.renderPrimeAd.bind(this);
    this.renderResearchArea = this.renderResearchArea.bind(this);
    this.onGeolocate = this.onGeolocate.bind(this);
    this.onSearch = debounce(this.onSearch.bind(this), 200);
    this.onFocus = this.onFocus.bind(this);
    this.onSearchSelect = this.onSearchSelect.bind(this);
    this.onCarSelect = this.onCarSelect.bind(this);
    this.researchArea = this.researchArea.bind(this);
    this.onFavoriteSelect = this.onFavoriteSelect.bind(this);
    this.onSearchBlur = this.onSearchBlur.bind(this);
    this.focus = this.focus.bind(this);
    this.updateDevice = this.updateDevice.bind(this);
    this.updateFavoriteLocations = this.updateFavoriteLocations.bind(this);
    this.getFavoriteLabelIcon = this.getFavoriteLabelIcon.bind(this);
    this.navigate = this.navigate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.toggleCarPinTooltip = this.toggleCarPinTooltip.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
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
    this.onContainerRef = this.onContainerRef.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
    this.checkWebGLSupport();
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { dongleId, device } = this.props;
    const { geoLocateCoords, search, carLastLocation, carNetworkLocation, searchSelect, favoriteLocations } = this.state;

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
      if (this.searchInputRef.current) {
        this.searchInputRef.current.value = '';
      }
    }

    if (prevProps.device !== device) {
      this.updateDevice();
    }

    if (!prevState.hasFocus && this.state.hasFocus) {
      this.props.dispatch(analyticsEvent('nav_focus', {
        has_car_location: Boolean(carLastLocation || carNetworkLocation),
        has_favorites: Object.keys(favoriteLocations)?.length || 0,
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
    this.updateFavoriteLocations();
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
    const { dongleId, hasNav } = this.props;
    if (!hasNav) {
      return;
    }

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

  updateFavoriteLocations() {
    const { dongleId, hasNav } = this.props;
    if (!hasNav) {
      return;
    }

    NavigationApi.getLocationsData(dongleId).then((resp) => {
      if (this.mounted && dongleId === this.props.dongleId) {
        const favorites = {};
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
    }).catch((err) => {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'nav_fetch_locationsdata' });
    });
  }

  getFavoriteLabelIcon(label) {
    switch (label) {
      case 'home':
        return PinHomeIcon;
      case 'work':
        return PinWorkIcon;
      default:
        return PinPinnedIcon;
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
      forwardLookup(searchInput.value, proximity).then((features) => {
        this.setState({
          noFly: false,
          searchSelect: null,
          search: features.filter((item) => !(['categoryQuery', 'chainQuery', 'administrativeArea'].includes(item.resultType))).slice(0, 10),
          searchLooking: false,
          savingAs: false,
          savedAs: false,
        });
      }).catch((err) => {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_geocode_forward_lookup' });
      });
    } else {
      this.setState({
        noFly: false,
        searchSelect: null,
        search: null,
        searchLooking: false,
        savingAs: false,
        savedAs: false,
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
        savedAs: false,
      });
    }
  }

  onSearchSelect(item, source) {
    this.props.dispatch(analyticsEvent('nav_search_select', {
      source,
      panned: this.state.noFly || this.state.noFly,
      is_favorite: Boolean(item.favoriteId),
      distance: item.distance,
    }));

    this.setState({
      noFly: false,
      searchSelect: item,
      searchLooking: false,
      savingAs: false,
      savedAs: false,
    });
    const endLocation = this.itemLngLat(item);
    const carLoc = this.getCarLocation();
    const startLocation = (carLoc ? carLoc.location : null) || this.state.geoLocateCoords || null;

    // don't compute route if start = destination (e.g. car to car)
    if (startLocation && (startLocation[0] !== endLocation[0] || startLocation[1] !== endLocation[1])) {
      getDirections([startLocation, endLocation]).then((route) => {
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

  onCarSelect(carLocation) {
    this.focus();

    const [lng, lat] = carLocation.location;
    const item = {
      address: {
        label: '',
      },
      favoriteIcon: PinCarIcon,
      favoriteId: null,
      position: {
        lng, lat,
      },
      resultType: 'car',
      title: '',
    };
    this.onSearchSelect(item, 'car');

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
    this.onSearchSelect(item, 'pin');
  }

  onSearchBlur(ev) {
    if (this.state.search && this.searchInputRef.current
      && this.overlayRef.current && this.overlayRef.current !== ev.relatedTarget) {
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
      searchSelect: null,
      searchLooking: false,
      savingAs: false,
      savedAs: false,
    });
  }

  clearSearchSelect() {
    this.setState({
      noFly: false,
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

      const bottomBoxHeight = (this.searchSelectBoxRef.current && viewport.height > 200)
        ? this.searchSelectBoxRef.current.getBoundingClientRect().height + 10 : 0;

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

  navigate() {
    const { dongleId, hasNav } = this.props;
    const { searchSelect } = this.state;

    if (!hasNav) {
      return;
    }

    this.props.dispatch(analyticsEvent('nav_navigate', {
      distance: searchSelect.distance,
    }));

    this.setState({ searchSelect: {
      ...searchSelect,
      settingDest: true,
      success: false,
    } });

    const pos = this.itemLoc(searchSelect);
    console.log(searchSelect);
    NavigationApi.setDestination(
      dongleId,
      pos.lat,
      pos.lng,
      Utils.formatPlaceName(searchSelect),
      Utils.formatPlaceAddress(searchSelect, 'state'),
    )
      .then((resp) => {
        if (resp.error) {
          throw new Error(resp.error);
        }

        this.setState({ searchSelect: {
          ...searchSelect,
          settingDest: true,
          success: resp.success,
          saved_next: resp.saved_next,
        } });
      }).catch((err) => {
        Sentry.captureException(err, { fingerprint: 'nav_set_destination' });
        console.log(`failed to set destination: ${err.message}`);
        this.setState({ searchSelect: {
          ...searchSelect,
          settingDest: false,
          success: false,
        } });
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
    NavigationApi.putLocationSave(
      dongleId,
      pos.lat,
      pos.lng,
      Utils.formatPlaceName(searchSelect),
      Utils.formatPlaceAddress(searchSelect, 'state'),
      'favorite',
      label,
    )
      .then(() => {
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
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_save_favorite' });
        this.setState({ savingAs: false, savedAs: false });
      });
  }

  deleteFavorite() {
    const { dongleId } = this.props;
    const { searchSelect } = this.state;
    if (searchSelect.favoriteId) {
      this.setState({ savingAs: true });
      NavigationApi.deleteLocationSave(dongleId, searchSelect.favoriteId).then(() => {
        this.updateFavoriteLocations();
        this.setState({
          noFly: false,
          searchSelect: null,
          searchLooking: false,
          savingAs: false,
          savedAs: false,
        }, this.flyToMarkers);
      }).catch((err) => {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_delete_favorite' });
        this.setState({ savingAs: false, savedAs: false });
      });
    }
  }

  researchArea() {
    const { viewport, windowWidth } = this.state;
    const searchInput = this.searchInputRef.current;

    forwardLookup(searchInput.value, null, viewport).then((features) => {
      this.setState({
        noFly: true,
        searchSelect: null,
        search: features.filter((item) => !(['categoryQuery', 'chainQuery', 'administrativeArea'].includes(item.resultType))).slice(0, 10),
        searchLooking: windowWidth < 600,
        savingAs: false,
        savedAs: false,
      });
    }).catch((err) => {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'nav_research_geocode_forward' });
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
    const { classes, device, hasNav } = this.props;
    const { mapError, hasFocus, search, searchLooking, searchSelect, favoriteLocations, viewport,
      windowWidth, showPrimeAd } = this.state;
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
        style={{ height: (hasFocus && hasNav) ? '60vh' : 200 }}
      >
        <ResizeHandler onResize={this.onResize} />
        <VisibilityHandler onVisible={this.updateDevice} onInit onDongleId minInterval={60} />
        { mapError
          && (
          <div className={ classes.mapError }>
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
            onViewportChange={() => {}}
          />
          { searchSelect && searchSelect.route
            && (
            <Source id="my-data" type="geojson" data={ searchSelect.route.geometry }>
              <Layer
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'bevel' }}
                paint={{ 'line-color': '#31a1ee', 'line-width': 3, 'line-blur': 1 }}
              />
            </Source>
            )}
          { !search && !searchSelect && favoriteLocations && Object.entries(favoriteLocations).map(([id, loc]) => {
            const Icon = loc.icon;
            return (
              <Marker
                latitude={loc.latitude}
                longitude={loc.longitude}
                key={id}
                offsetLeft={-7.5}
                offsetTop={-24}
                captureDrag={false}
                captureClick={false}
                captureDoubleClick={false}
              >
                <Icon
                  className={classes.favoritePin}
                  onClick={() => this.onFavoriteSelect(id, loc)}
                  alt="favorite-location"
                />
              </Marker>
            );
          })}
          { carLocation
            && (
            <Marker
              latitude={ carLocation.location[1] }
              longitude={ carLocation.location[0] }
              offsetLeft={ -10 }
              offsetTop={ -30 }
              captureDrag={ false }
              captureClick
              captureDoubleClick={ false }
            >
              <PinCarIcon
                className={ classes.pin }
                onMouseEnter={ () => this.toggleCarPinTooltip(true) }
                onMouseLeave={ () => this.toggleCarPinTooltip(false) }
                alt="car-location"
                onClick={ () => this.onCarSelect(carLocation) }
              />
              <div
                className={ classes.carPinTooltip }
                ref={ this.carPinTooltipRef }
                style={{ ...carPinTooltipStyle, display: 'none' }}
              >
                { dayjs(carLocation.time).format('h:mm A') }
                ,
                <br />
                { timeFromNow(carLocation.time) }
              </div>
            </Marker>
            )}
          { carLocation && Boolean(carLocation.accuracy)
            && (
            <Source type="geojson" data={ this.carLocationCircle(carLocation) }>
              <Layer
                id="polygon"
                type="fill"
                source="polygon"
                layout={{}}
                paint={{ 'fill-color': '#31a1ee', 'fill-opacity': 0.3 }}
              />
            </Source>
            )}
          { search && !searchSelect && search.map((item) => (
            <Marker
              latitude={ this.itemLoc(item).lat }
              longitude={ this.itemLoc(item).lng }
              key={ item.id }
              offsetLeft={ -10 }
              offsetTop={ -30 }
              captureDrag={ false }
              captureClick={ false }
              captureDoubleClick={ false }
            >
              <PinMarkerIcon
                className={ classes.pinClick }
                onClick={ () => this.onSearchSelect(item, 'pin') }
                alt="pin-location"
              />
            </Marker>
          ))}
          { searchSelect && this.renderSearchSelectMarker(searchSelect) }
          { hasNav
            && (
            <HTMLOverlay
              redraw={ this.renderOverlay }
              style={{ ...cardStyle, top: 10 }}
              captureScroll
              captureDrag
              captureClick
              captureDoubleClick
              capturePointerMove
            />
            )}
          { searchSelect
            && (
            <HTMLOverlay
              redraw={ this.renderSearchOverlay }
              captureScroll
              captureDrag
              captureClick
              captureDoubleClick
              capturePointerMove
              style={{ ...cardStyle, bottom: 10 }}
            />
            )}
          { search && searchLooking && !searchSelect
            && (
            <HTMLOverlay
              redraw={ this.renderResearchArea }
              captureScroll
              captureDrag
              captureClick
              captureDoubleClick
              capturePointerMove
              style={{ ...cardStyle, bottom: 10, left: '50%', width: 180, transform: 'translate(-50%, 0)' }}
            />
            )}
          { showPrimeAd && !hasNav && !device.prime && device.is_owner
            && (
            <HTMLOverlay
              redraw={ this.renderPrimeAd }
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

  renderSearchSelectMarker(searchSelect) {
    const { classes } = this.props;

    let lat; let
      lng;
    if (searchSelect.resultType === 'car') {
      [lng, lat] = this.getCarLocation().location;
    } else {
      ({ lat, lng } = this.itemLoc(searchSelect));
    }

    const Icon = searchSelect.favoriteIcon || PinMarkerIcon;
    return (
      <Marker
        latitude={ lat }
        longitude={ lng }
        offsetLeft={ -10 }
        offsetTop={ -30 }
        captureDrag={ false }
        captureClick={ false }
        captureDoubleClick={ false }
      >
        <Icon className={ classes.pin } alt="pin-location" />
      </Marker>
    );
  }

  renderOverlay() {
    const { classes } = this.props;
    const { search, searchSelect, searchLooking, geoLocateCoords } = this.state;
    const carLocation = this.getCarLocation();

    return (
      <div
        className={ classes.overlay }
        ref={ this.overlayRef }
        tabIndex={ -1 }
        onBlur={ this.onSearchBlur }
        onClick={ this.focus }
      >
        <TextField
          onChange={ this.onSearch }
          fullWidth
          inputRef={ this.searchInputRef }
          placeholder="where do you want to go?"
          InputProps={{
            onFocus: this.onFocus,
            onBlur: this.onSearchBlur,
            classes: { root: classes.overlayTextfield },
            endAdornment: <>
              { this.searchInputRef.current && this.searchInputRef.current.value
                && (
                <InputAdornment position="end">
                  <Clear className={ classes.overlayClearButton } onClick={ this.clearSearch } />
                </InputAdornment>
                )}
              <InputAdornment position="end">
                <Search className={ classes.overlaySearchButton } onClick={ this.onSearchBlur } />
              </InputAdornment>
            </>,
          }}
        />
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
              <div key={ item.id } className={ classes.overlaySearchItem } onClick={ () => this.onSearchSelect(item, 'list') }>
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
    const { searchSelect, geoLocateCoords, saveAsMenu, savingAs, savedAs } = this.state;

    const carLocation = this.getCarLocation();
    const noRoute = !searchSelect.route && (carLocation || geoLocateCoords);

    const isCar = searchSelect.resultType === 'car';

    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const title = isCar ? device.alias : Utils.formatPlaceName(searchSelect);
    const { lat, lng } = searchSelect.position;

    let geoUri;
    if (isIos) {
      geoUri = `https://maps.apple.com/?ll=${lat},${lng}&q=${title}`;
    } else {
      geoUri = `https://maps.google.com/?q=${lat},${lng}`;
    }

    return (
      <div className={ classes.searchSelectBox } ref={ this.searchSelectBoxRef }>
        <Clear className={ classes.clearSearchSelect } onClick={ this.clearSearchSelect } />
        <div className={ classes.searchSelectBoxHeader }>
          <div className={ classes.searchSelectBoxTitle }>
            <Typography className={ classes.bold }>{ title }</Typography>
            { searchSelect.route
              && (
              <Typography className={ classes.searchSelectBoxDetails }>
                { Utils.formatRouteDistance(searchSelect.route) }
                {' '}
                (
                { Utils.formatRouteDuration(searchSelect.route) }
                )
              </Typography>
              )}
            { isCar && <Typography className={ classes.searchSelectBoxDetails }>{ timeFromNow(carLocation.time) }</Typography> }
          </div>
          <div className={ classes.searchSelectBoxButtons }>
            <Button classes={{ root: isCar ? classes.searchSelectButton : classes.searchSelectButtonSecondary }} target="_blank" href={geoUri}>
              open in maps
            </Button>
            { searchSelect.favoriteId
              ? (
                <Button
                  disabled={ savingAs || savedAs }
                  onClick={ this.deleteFavorite }
                  classes={{ root: classes.searchSelectButtonSecondary, label: classes.noWrap }}
                >
                  { savingAs ? '...' : 'delete' }
                </Button>
              )
              : (
                <Button
                  disabled={ savingAs || savedAs }
                  onClick={ (ev) => this.setState({ saveAsMenu: ev.target }) }
                  classes={{ root: classes.searchSelectButtonSecondary, label: classes.noWrap }}
                >
                  { savingAs ? '...' : (savedAs ? 'saved' : 'save as') }
                </Button>
              )}
            <Menu
              id="menu-save-as"
              open={ Boolean(saveAsMenu) }
              anchorEl={ saveAsMenu }
              onClose={ () => this.setState({ saveAsMenu: null }) }
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
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
            { searchSelect.settingDest
              ? (
                <div
                  className={ `${classes.searchSelectButton} ${classes.searchSelectButtonFake}` }
                  ref={ this.navigateFakeButtonRef }
                >
                  { searchSelect.success
                    ? <Typography>destination set</Typography>
                    : <CircularProgress size={ 19 } /> }
                  <Popper
                    open={ Boolean(searchSelect.success && searchSelect.saved_next) }
                    placement="bottom"
                    anchorEl={ this.navigateFakeButtonRef.current }
                    className={ classes.savedNextPopover }
                  >
                    <Typography>device offline</Typography>
                    <Typography>destination will be set once device is online</Typography>
                  </Popper>
                </div>
              )
              : (!isCar
              && (
              <Button
                disabled={ Boolean(noRoute) }
                onClick={ this.navigate }
                classes={{ root: classes.searchSelectButton }}
                style={{ marginBottom: 8 }}
              >
                { noRoute ? 'no route' : 'navigate' }
              </Button>
              )
              )}
          </div>
        </div>
        <Typography className={ classes.searchSelectBoxDetails }>
          {isCar && `${Utils.formatPlaceName(searchSelect)}, `}
          {Utils.formatPlaceAddress(searchSelect, 'state')}
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
    const { classes } = this.props;

    return (
      <div className={ `${classes.searchSelectBox} ${classes.primeAdContainer}` } ref={ this.primeAdBoxRef }>
        <Clear
          className={ classes.clearSearchSelect }
          onClick={ () => this.setState({ showPrimeAd: false }, this.flyToMarkers) }
        />
        <div className={ classes.searchSelectBoxHeader }>
          <div className={ classes.searchSelectBoxTitle }>
            <Typography className={ classes.primeAdTitle }>comma prime</Typography>
          </div>
          <div className={ classes.searchSelectBoxButtons }>
            <Button
              onClick={ () => this.props.dispatch(primeNav(true)) }
              className={ `${classes.searchSelectButton} ${classes.primeAdButton} primeSignUp` }
            >
              sign up
            </Button>
          </div>
        </div>
        <Typography className={ classes.primeAdDetails }>
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
