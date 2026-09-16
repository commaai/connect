import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';
import mapboxgl from 'mapbox-gl';
import { withStyles, Typography, Button } from '@material-ui/core';
import dayjs from 'dayjs';

import { api } from '../../api/backend';
import { analyticsEvent } from '../../actions';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN, reverseLookup } from '../../utils/geocode';
import Colors from '../../colors';
import { Clear, PinCarIcon } from '../../icons';
import { timeFromNow } from '../../utils';
import VisibilityHandler from '../VisibilityHandler';
import { subscribeWindowSize } from '../../hooks/window';
import * as Utils from './utils';
import { isIos } from '../../utils/browser.js';

mapboxgl.accessToken = MAPBOX_TOKEN;

const styles = {
  map: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  mapContainer: {
    position: 'relative',
    borderBottom: `1px solid ${Colors.white10}`,
    '& .mapboxgl-ctrl-geolocate': {
      display: 'none',
    },
  },
  mapError: {
    position: 'relative',
    zIndex: 1,
    marginTop: 20,
    marginLeft: 20,
    '& p': { color: Colors.white50 },
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
};

const initialState = {
  hasFocus: false,
  carLastLocation: null,
  carLastLocationTime: null,
  geoLocateCoords: null,
  searchSelect: null,
  windowWidth: window.innerWidth,
};

const itemLngLat = (item, bounds = false) => {
  const { lng, lat } = item.access?.length ? item.access[0] : item.position;
  const coordinates = [lng, lat];
  return bounds ? [coordinates, coordinates] : coordinates;
};

const SearchSelectCard = ({ classes, device, searchSelect, carLocation, cardRef, onClear }) => {
  const { lat, lng } = searchSelect.position;
  const title = device.alias;

  const mapsUrl = isIos()
    ? `https://maps.apple.com/?ll=${lat},${lng}&q=${title}`
    : `https://maps.google.com/?q=${lat},${lng}`;

  return (
    <div className={classes.searchSelectBox} ref={cardRef}>
      <Clear className={classes.clearSearchSelect} onClick={onClear} />
      <div className={classes.searchSelectBoxHeader}>
        <div className={classes.searchSelectBoxTitle}>
          <Typography className={classes.bold}>{title}</Typography>
          <Typography className={classes.searchSelectBoxDetails}>{timeFromNow(carLocation.time)}</Typography>
        </div>
        <div className={classes.searchSelectBoxButtons}>
          <Button classes={{ root: classes.searchSelectButton }} target="_blank" href={mapsUrl}>
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
};

const Navigation = (props) => {
  const { classes, dispatch, device, dongleId } = props;

  const propsRef = useRef(props);
  propsRef.current = props;

  const mountedRef = useRef(false);
  const mapContainerRef = useRef(null);
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const geolocateControlRef = useRef(null);
  const carMarkerRef = useRef(null);
  const searchSelectBoxRef = useRef(null);
  const carPinTooltipRef = useRef(null);
  const prevDongleIdRef = useRef(undefined);
  const prevDeviceRef = useRef(undefined);
  const prevFlyStateRef = useRef({
    carLastLocation: null,
    geoLocateCoords: null,
    searchSelect: null,
  });

  const [state, setState] = useState(() => ({
    ...initialState,
    mapError: null,
    windowWidth: window.innerWidth,
  }));
  const [markerElement] = useState(() => document.createElement('div'));

  const {
    hasFocus, carLastLocation, carLastLocationTime, geoLocateCoords,
    searchSelect, windowWidth, mapError,
  } = state;

  function getCarLocation() {
    if (carLastLocation) {
      return {
        location: carLastLocation,
        time: carLastLocationTime,
      };
    }
    return null;
  }

  function focus() {
    setState((prev) => (
      prev.hasFocus ? prev : { ...prev, hasFocus: true }
    ));
  }

  function toggleCarPinTooltip(visible) {
    const tooltip = carPinTooltipRef.current;
    const map = mapRef.current;
    const marker = carMarkerRef.current;
    if (!tooltip) {
      return;
    }
    if (visible && map && marker) {
      const markerPoint = map.project(marker.getLngLat());
      const pixelsAvailable = map.getContainer().clientHeight - markerPoint.y;

      tooltip.style.transform = pixelsAvailable < 50
        ? 'translate(calc(-50% + 10px), -81px)'
        : 'translate(calc(-50% + 10px), -4px)';
    }
    tooltip.style.display = visible ? 'block' : 'none';
  }

  function clearSearchSelect() {
    setState((prev) => ({
      ...prev,
      searchSelect: null,
    }));
  }

  async function getDeviceLastLocation() {
    const { dongleId: currentDongleId, device: currentDevice } = propsRef.current;
    if (currentDevice.shared) {
      return;
    }
    try {
      const resp = await api.devices.fetchLocation(currentDongleId);
      if (mountedRef.current && currentDongleId === propsRef.current.dongleId) {
        setState((prev) => ({
          ...prev,
          carLastLocation: [resp.lng, resp.lat],
          carLastLocationTime: resp.time,
        }));
      }
    } catch (err) {
      if (!err.message || err.message.indexOf('no_segments_uploaded') === -1) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_fetch_location' });
      }
    }
  }

  function updateDevice() {
    getDeviceLastLocation();
  }

  function onCarSelect(carLoc) {
    focus();

    const [lng, lat] = carLoc.location;
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

    dispatch(analyticsEvent('nav_search_select', {
      source: 'car',
      panned: false,
      distance: item.distance,
    }));

    setState((prev) => ({
      ...prev,
      searchSelect: item,
    }));

    reverseLookup(carLoc.location, true).then((location) => {
      if (!location) {
        return;
      }

      setState((prev) => ({
        ...prev,
        searchSelect: {
          ...prev.searchSelect,
          address: {
            label: location.details,
          },
          title: location.place,
        },
      }));
    });
  }

  function flyToMarkers() {
    const map = mapRef.current;
    const carLocation = getCarLocation();

    if (!map) {
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
      bounds.push(itemLngLat(searchSelect, true));
    }
    if (bounds.length) {
      const bbox = [[
        Math.min.apply(null, bounds.map((entry) => entry[0][0])),
        Math.min.apply(null, bounds.map((entry) => entry[0][1])),
      ], [
        Math.max.apply(null, bounds.map((entry) => entry[1][0])),
        Math.max.apply(null, bounds.map((entry) => entry[1][1])),
      ]];

      if (Math.abs(bbox[0][0] - bbox[1][0]) < 0.01) {
        bbox[0][0] -= 0.01;
        bbox[0][1] += 0.01;
      }
      if (Math.abs(bbox[1][0] - bbox[1][1]) < 0.01) {
        bbox[1][0] -= 0.01;
        bbox[1][1] += 0.01;
      }

      const mapHeight = map.getContainer().clientHeight;
      const bottomBoxHeight = (searchSelectBoxRef.current && mapHeight > 200)
        ? searchSelectBoxRef.current.getBoundingClientRect().height + 10 : 0;

      const padding = {
        left: 20,
        right: 20,
        top: 20,
        bottom: bottomBoxHeight + 20,
      };
      try {
        map.fitBounds(bbox, {
          padding,
          maxZoom: 10,
          duration: 0,
        });
      } catch (err) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_flymarkers_viewport' });
      }
    }
  }

  useEffect(() => {
    const element = mapElementRef.current;

    if (!element) {
      return undefined;
    }

    if (!mapboxgl.supported()) {
      setState((prev) => ({
        ...prev,
        mapError: 'Failed to get WebGL context, your browser or device may not support WebGL.',
      }));
      return undefined;
    }
    // create map
    const map = new mapboxgl.Map({
      container: element,
      style: MAPBOX_STYLE,
      center: [DEFAULT_LOCATION.longitude, DEFAULT_LOCATION.latitude],
      zoom: 5,
      pitch: 0,
      maxPitch: 0,
      attributionControl: false,
      dragRotate: false,
    });
    mapRef.current = map;

    // create control
    const geolocateControl = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      showAccuracyCircle: false,
      trackUserLocation: true,
      fitBoundsOptions: {
        maxZoom: 10,
      },
    });
    map.addControl(geolocateControl);
    geolocateControlRef.current = geolocateControl;
    geolocateControl._updateCamera = () => {};

    // create marker
    const carMarker = new mapboxgl.Marker({
      element: markerElement,
      anchor: 'top-left',
      offset: [-10, -30],
    });
    carMarkerRef.current = carMarker;

    const stopMarkerClick = (event) => event.stopPropagation();
    markerElement.addEventListener('click', stopMarkerClick);

    const setFocused = () => {
      setState((prev) => (
        prev.hasFocus ? prev : { ...prev, hasFocus: true }
      ));
    };

    const handleMoveStart = (event) => {
      if (event.originalEvent) {
        setFocused();
      }
    };

    const handleGeolocate = (event) => {
      if (event.coords) {
        setState((prev) => ({
          ...prev,
          geoLocateCoords: [event.coords.longitude, event.coords.latitude],
        }));
      }
    };

    const handleError = (event) => {
      setState((prev) => ({
        ...prev,
        mapError: event.error.message,
      }));
    };

    map.on('click', setFocused);
    map.on('movestart', handleMoveStart);
    map.on('error', handleError);
    geolocateControl.on('geolocate', handleGeolocate);

    return () => {
      markerElement.removeEventListener('click', stopMarkerClick);
      geolocateControl.off('geolocate', handleGeolocate);

      carMarker.remove();
      map.remove(); // this cleans up map listeners

      carMarkerRef.current = null;
      geolocateControlRef.current = null;
      mapRef.current = null;
    };
  }, [markerElement]);

  // update marker after map inits
  useEffect(() => {
    const map = mapRef.current;
    const marker = carMarkerRef.current;

    if (!map || !marker) {
      return;
    }

    if (!carLastLocation) {
      marker.remove();
      return;
    }

    marker.setLngLat(carLastLocation);

    if (!marker.getElement().parentNode) {
      marker.addTo(map);
    }
  }, [carLastLocation]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const stopTouchPropagation = (ev) => ev.stopPropagation();
    el.addEventListener('touchstart', stopTouchPropagation);
    return () => {
      el.removeEventListener('touchstart', stopTouchPropagation);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const unsub = subscribeWindowSize(({ width }) => {
      setState((prev) => ({ ...prev, windowWidth: width }));
    });
    return () => {
      mountedRef.current = false;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const prev = prevFlyStateRef.current;
    const shouldFly = (carLastLocation && prev.carLastLocation !== carLastLocation)
      || (geoLocateCoords && !prev.geoLocateCoords)
      || (searchSelect && prev.searchSelect !== searchSelect);
    prevFlyStateRef.current = { carLastLocation, geoLocateCoords, searchSelect };
    if (shouldFly) {
      flyToMarkers();
    }
  }, [carLastLocation, geoLocateCoords, searchSelect]);

  useEffect(() => {
    if (prevDongleIdRef.current !== dongleId) {
      prevDongleIdRef.current = dongleId;
      setState((prev) => ({
        ...prev,
        ...initialState,
        windowWidth: window.innerWidth,
      }));
    }
  }, [dongleId]);

  useEffect(() => {
    if (prevDeviceRef.current !== device) {
      prevDeviceRef.current = device;
      updateDevice();
    }
  }, [device]);

  useEffect(() => {
    if (hasFocus) {
      geolocateControlRef.current?.trigger();
      dispatch(analyticsEvent('nav_focus', {
        has_car_location: Boolean(carLastLocation),
      }));
    }
  }, [hasFocus]);

  const carLocation = getCarLocation();

  const cardStyle = windowWidth < 600
    ? { zIndex: 4, width: 'auto', height: 'auto', top: 'auto', bottom: 'auto', left: 10, right: 10 }
    : { zIndex: 4, width: 360, height: 'auto', top: 'auto', bottom: 'auto', left: 10 };

  return (
    <div
      ref={mapContainerRef}
      className={classes.mapContainer}
      style={{ height: 200 }}
    >
      <div ref={mapElementRef} className={classes.map} />
      <VisibilityHandler onVisible={updateDevice} onInit onDongleId minInterval={60} />
      {mapError
        && (
          <div className={classes.mapError}>
            <Typography>Could not initialize map.</Typography>
            <Typography>{mapError}</Typography>
          </div>
        )}
      {carLocation && createPortal(
        <>
          <PinCarIcon
            className={classes.pin}
            onMouseEnter={() => toggleCarPinTooltip(true)}
            onMouseLeave={() => toggleCarPinTooltip(false)}
            alt="car-location"
            onClick={(event) => {
              event.stopPropagation();
              onCarSelect(carLocation);
            }}
          />

          <div
            className={classes.carPinTooltip}
            ref={carPinTooltipRef}
            style={{
              display: 'none',
              transform: 'translate(calc(-50% + 10px), -4px)',
            }}
          >
            {dayjs(carLocation.time).format('h:mm A')}
            ,
            <br />
            {timeFromNow(carLocation.time)}
          </div>
        </>,
        markerElement,
      )}
      {searchSelect && (
        <div style={{ position: 'absolute', ...cardStyle, bottom: 10 }}>
          <SearchSelectCard
            classes={classes}
            device={device}
            searchSelect={searchSelect}
            carLocation={carLocation}
            cardRef={searchSelectBoxRef}
            onClear={clearSearchSelect}
          />
        </div>
      )}
    </div>
  );
};

const stateToProps = (state) => ({
  device: state.device,
  dongleId: state.dongleId,
});

export default connect(stateToProps)(withStyles(styles)(Navigation));
