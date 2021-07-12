import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import debounce from 'debounce';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, Source, WebMercatorViewport, Layer} from 'react-map-gl';
import { withStyles, TextField, InputAdornment, Typography, Button, Menu, MenuItem, CircularProgress, Popper }
  from '@material-ui/core';
import { Search, Clear } from '@material-ui/icons';
import moment from 'moment';

import { devices as Devices, navigation as NavigationAPI } from '@commaai/comma-api';
import Colors from '../../colors';
import GeocodeApi from '../../api/geocode';
import { pin_car, pin_marker, pin_home, pin_work, pin_pinned } from '../../icons';
import ResizeHandler from '../ResizeHandler';
import * as Demo from '../../demo';

const MAP_STYLE = 'mapbox://styles/commaai/cjj4yzqk201c52ss60ebmow0w';
const styles = () => ({
  noWrap: {
    whiteSpace: 'nowrap',
  },
  mapContainer: {
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
  bold: {
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
    flexShrink: 0,
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
    '& p': {
      color: '#404B4F',
      lineHeight: '1.4em',
      fontWeight: 500,
    },
  },
  searchSelectBoxDetails: {
    color: Colors.white40,
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
    '& p:first-child': {
      fontWeight: 500,
    },
  },
});

const initialState = {
  hasFocus: false,
  viewport: {
    longitude: -122.45,
    latitude: 37.78,
    zoom: 0,
  },
  carLocation: null,
  carLocationTime: null,
  favoriteLocations: [],
  geoLocateCoords: null,
  search: null,
  route: null,
  searchSelect: null,
  searchLooking: false,
  windowWidth: window.innerWidth,
  saveAsMenu: null,
  savingAs: false,
  savedAs: false,
}

class Navigation extends Component {
  constructor(props) {
    super(props);
    this.mounted = null;
    this.state = {
      ...initialState,
      windowWidth: window.innerWidth,
    };

    this.searchInputRef = React.createRef();
    this.searchSelectBoxRef = React.createRef();
    this.overlayRef = React.createRef();
    this.carPinTooltipRef = React.createRef();
    this.navigateFakeButtonRef = React.createRef();

    this.flyToMarkers = this.flyToMarkers.bind(this);
    this.renderOverlay = this.renderOverlay.bind(this);
    this.renderSearchOverlay = this.renderSearchOverlay.bind(this);
    this.onGeolocate = this.onGeolocate.bind(this);
    this.onSearch = debounce(this.onSearch.bind(this), 200);
    this.onSearchSelect = this.onSearchSelect.bind(this);
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
  }

  componentDidMount() {
    this.mounted = true;
    this.componentDidUpdate({}, {});
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
      this.updateDevice();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  updateDevice() {
    const { dongleId } = this.props;

    if (Demo.isDemo()) {
      return;
    }

    this.updateFavoriteLocations();

    Devices.fetchLocation(dongleId).then((resp) => {
      if (this.mounted && dongleId === this.props.dongleId) {
        this.setState({
          carLocation: [resp.lng, resp.lat],
          carLocationTime: resp.time,
        }, this.flyToMarkers);
      }
    }).catch(console.log);
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
      const proximity = this.state.carLocation || this.state.geoLocateCoords || null;
      GeocodeApi().forwardLookup(searchInput.value, proximity).then((features) => {
        this.setState({
          searchSelect: null,
          search: features.filter((item) =>
            !(['categoryQuery', 'chainQuery', 'administrativeArea'].includes(item.resultType))).slice(0, 10),
          searchLooking: false,
          savingAs: false,
          savedAs: false,
        });
      });
    } else {
      this.setState({ searchSelect: null, search: null, searchLooking: false, savingAs: false, savedAs: false });
    }
  }

  onSearchSelect(item) {
    this.setState({
      searchSelect: item,
      search: null,
      searchLooking: false,
    });
    const startLocation = this.state.carLocation || this.state.geoLocateCoords || null;
    if (startLocation) {
      GeocodeApi().getDirections([startLocation, this.itemLngLat(item)]).then((route) => {
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
      search: null,
      route: null,
      searchSelect: null,
      searchLooking: false,
      savingAs: false,
      savedAs: false,
    });
  }

  flyToMarkers() {
    const { hasNav } = this.props;
    const { geoLocateCoords, search, searchSelect, carLocation, windowWidth, viewport } = this.state;

    const bounds = [];
    if (geoLocateCoords) {
      bounds.push([geoLocateCoords, geoLocateCoords]);
    }
    if (carLocation) {
      bounds.push([carLocation, carLocation]);
    }
    if (searchSelect) {
      bounds.push(this.itemLngLat(searchSelect, true));
    }
    if (search) {
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

      const bottomBoxHeight = (this.searchSelectBoxRef.current && viewport.height > 200) ?
        this.searchSelectBoxRef.current.getBoundingClientRect().height + 10 : 0
      const padding = {
        left: (windowWidth < 600 || !search) ? 20 : 390,
        right: 20,
        top: hasNav ? 82 : 20,
        bottom: bottomBoxHeight + 20,
      };
      if (viewport.width) {
        this.setState({
          viewport: new WebMercatorViewport(viewport).fitBounds(bbox, { padding: padding, maxZoom: 10 })
        });
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
          savingAs: false,
          savedAs: true,
          searchSelect: {
            ...searchSelect,
            favoriteIcon: undefined,
          },
        });
      }).catch((err) => {
        console.log(err);
        this.setState({ savingAs: false, savedAs: false });
      });
    }
  }

  render() {
    const { classes, hasNav } = this.props;
    const { hasFocus, search , searchSelect, carLocation, favoriteLocations, carLocationTime, viewport,
      windowWidth } = this.state;

    const cardStyle = windowWidth < 600 ?
      { width: 'auto', height: 'auto', top: 'auto', bottom: 'auto', left: 10, right: 10 } :
      { width: 360, height: 'auto', top: 'auto', bottom: 'auto', left: 10 };

    let carPinTooltipStyle = { transform: 'translate(calc(-50% + 10px), -4px)' };
    if (carLocation) {
      const pixelsAvailable = viewport.height - new WebMercatorViewport(viewport).project(carLocation)[1];
      if (pixelsAvailable < 50) {
        carPinTooltipStyle = { transform: 'translate(calc(-50% + 10px), -81px)' };
      }
    }

    return (
      <div className={ classes.mapContainer } style={{ height: (hasFocus && hasNav) ? '60vh' : 200 }}>
        <ResizeHandler onResize={ this.onResize } />
        <ReactMapGL { ...viewport } onViewportChange={ (viewport) => this.setState({ viewport }) }
          mapStyle={ MAP_STYLE } width="100%" height="100%" onNativeClick={ this.focus } maxPitch={ 0 }
          mapboxApiAccessToken={ process.env.REACT_APP_MAPBOX_TOKEN } attributionControl={ false } dragRotate={ false }
          onContextMenu={ null }>
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
              <img className={ classes.favoritePin } src={ loc.icon } onClick={ () => this.onFavoriteSelect(id, loc) } />
            </Marker>
          )}
          { carLocation &&
            <Marker latitude={ carLocation[1] } longitude={ carLocation[0] } offsetLeft={ -10 } offsetTop={ -32 }
              captureDrag={ false } captureClick={ true } captureDoubleClick={ false }>
              <img className={ classes.pin } src={ pin_car } onMouseEnter={ () => this.toggleCarPinTooltip(true) }
                onMouseLeave={ () => this.toggleCarPinTooltip(false) } />
              <div className={ classes.carPinTooltip } ref={ this.carPinTooltipRef }
                style={{ ...carPinTooltipStyle, display: 'none' }}>
                { moment(carLocationTime).format('LT') },<br />
                { moment(carLocationTime).fromNow() }
              </div>
            </Marker>
          }
          { search && search.map((item) =>
            <Marker latitude={ this.itemLoc(item).lat } longitude={ this.itemLoc(item).lng } key={ item.id }
              offsetLeft={ -10 } offsetTop={ -32 } captureDrag={ false } captureClick={ false }
              captureDoubleClick={ false }>
              <img className={ classes.pinClick } src={ pin_marker } onClick={ () => this.onSearchSelect(item) } />
            </Marker>
          )}
          { searchSelect &&
            <Marker latitude={ this.itemLoc(searchSelect).lat } longitude={ this.itemLoc(searchSelect).lng }
              offsetLeft={ -10 } offsetTop={ -32 } captureDrag={ false } captureClick={ false }
              captureDoubleClick={ false }>
              <img className={ classes.pin } src={ searchSelect.favoriteIcon ? searchSelect.favoriteIcon : pin_marker } />
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
    const { search, searchLooking } = this.state;

    return (
      <div className={ classes.overlay } ref={ this.overlayRef } tabIndex={ -1 } onBlur={ this.onSearchBlur }
        onClick={ this.focus }>
        <TextField onChange={ this.onSearch } fullWidth={ true } inputRef={ this.searchInputRef }
          placeholder="search"
          InputProps={{
            onFocus: this.onSearch,
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
        { search && !searchLooking &&
          <div className={ `${classes.overlaySearchResults} scrollstyle` }>
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
    const { searchSelect, carLocation, geoLocateCoords, saveAsMenu, savingAs, savedAs } = this.state;

    const noRoute = !searchSelect.route && (carLocation || geoLocateCoords);

    return (
      <div className={ classes.searchSelectBox } ref={ this.searchSelectBoxRef }>
        <div className={ classes.searchSelectBoxHeader }>
          <div>
            <Typography className={ classes.bold }>{ this.formatSearchName(searchSelect) }</Typography>
            { searchSelect.route &&
              <Typography className={ classes.searchSelectBoxDetails }>
                { this.formatDistance(searchSelect.route) } (
                { this.formatDuration(searchSelect.route) })
              </Typography>
            }
          </div>
          { searchSelect.favoriteId ?
            <Button disabled={ savingAs || savedAs } onClick={ this.deleteFavorite }
              classes={{ root: classes.searchSelectButton, label: classes.noWrap }}>
              { savingAs ? '...' : (savedAs ? 'deleted' :  'delete') }
            </Button>
          :
            <Button disabled={ savingAs || savedAs }
              onClick={ (ev) => this.setState({ saveAsMenu: ev.target }) }
              classes={{ root: classes.searchSelectButton, label: classes.noWrap }}>
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
              classes={{ root: classes.searchSelectButton }}>
              { noRoute ? 'no route' : 'navigate' }
            </Button>
          }
        </div>
        <Typography className={ classes.searchSelectBoxDetails }>
          { this.formatSearchDetails(searchSelect, false) }
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
