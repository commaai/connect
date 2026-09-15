import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';
import ReactMapGL, { GeolocateControl, Marker, WebMercatorViewport } from 'react-map-gl';
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

const styles = {
  mapContainer: {
    position: 'relative',
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
  searchLooking: false,
  noFly: false,
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
  const searchSelectBoxRef = useRef(null);
  const carPinTooltipRef = useRef(null);
  const prevDongleIdRef = useRef(undefined);
  const prevDeviceRef = useRef(undefined);
  const prevFlyStateRef = useRef({
    carLastLocation: null,
    geoLocateCoords: null,
    searchSelect: null,
    search: null,
  });

  const [state, setState] = useState(() => ({
    ...initialState,
    viewport: {
      ...DEFAULT_LOCATION,
      zoom: 5,
    },
    mapError: null,
    windowWidth: window.innerWidth,
  }));

  const {
    hasFocus, carLastLocation, carLastLocationTime, geoLocateCoords,
    search, searchSelect, searchLooking, noFly, windowWidth, viewport, mapError,
  } = state;

  function checkWebGLSupport() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      setState((prev) => ({ ...prev, mapError: 'Failed to get WebGL context, your browser or device may not support WebGL.' }));
    }
  }

  function getCarLocation() {
    if (carLastLocation) {
      return {
        location: carLastLocation,
        time: carLastLocationTime,
      };
    }
    return null;
  }

  function focus(ev) {
    if (!hasFocus && (!ev || !ev.srcEvent || !ev.srcEvent.path || !mapContainerRef.current
      || ev.srcEvent.path.includes(mapContainerRef.current))) {
      setState((prev) => ({ ...prev, hasFocus: true }));
    }
  }

  function toggleCarPinTooltip(visible) {
    const tooltip = carPinTooltipRef.current;
    if (tooltip) {
      tooltip.style.display = visible ? 'block' : 'none';
    }
  }

  function onGeolocate(pos) {
    if (pos && pos.coords) {
      setState((prev) => ({ ...prev, geoLocateCoords: [pos.coords.longitude, pos.coords.latitude] }));
    }
  }

  function clearSearchSelect() {
    setState((prev) => ({
      ...prev,
      noFly: false,
      searchSelect: null,
      searchLooking: false,
    }));
  }

  function viewportChange(nextViewport, interactionState) {
    setState((prev) => ({ ...prev, viewport: nextViewport }));

    if (interactionState.isPanning || interactionState.isZooming || interactionState.isRotating) {
      focus();

      if (search && !searchSelect && !searchLooking) {
        setState((prev) => ({ ...prev, searchLooking: true, noFly: true }));
      }
    }
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
      panned: noFly,
      distance: item.distance,
    }));

    setState((prev) => ({
      ...prev,
      noFly: false,
      searchSelect: item,
      searchLooking: false,
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
    const carLocation = getCarLocation();

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
      bounds.push(itemLngLat(searchSelect, true));
    } else if (search) {
      search.forEach((item) => bounds.push(itemLngLat(item, true)));
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

      const bottomBoxHeight = (searchSelectBoxRef.current && viewport.height > 200)
        ? searchSelectBoxRef.current.getBoundingClientRect().height + 10 : 0;

      const padding = {
        left: (windowWidth < 600 || !search) ? 20 : 390,
        right: 20,
        top: 20,
        bottom: bottomBoxHeight + 20,
      };
      if (viewport.width) {
        try {
          const newVp = new WebMercatorViewport(viewport).fitBounds(bbox, { padding, maxZoom: 10 });
          setState((prev) => ({ ...prev, viewport: newVp }));
        } catch (err) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'nav_flymarkers_viewport' });
        }
      }
    }
  }

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
    checkWebGLSupport();
    return () => {
      mountedRef.current = false;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const prev = prevFlyStateRef.current;
    const shouldFly = (carLastLocation && prev.carLastLocation !== carLastLocation)
      || (geoLocateCoords && !prev.geoLocateCoords)
      || (searchSelect && prev.searchSelect !== searchSelect)
      || (search && prev.search !== search);
    prevFlyStateRef.current = { carLastLocation, geoLocateCoords, searchSelect, search };
    if (shouldFly) {
      flyToMarkers();
    }
  }, [carLastLocation, geoLocateCoords, searchSelect, search]);

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
      dispatch(analyticsEvent('nav_focus', {
        has_car_location: Boolean(carLastLocation),
      }));
    }
  }, [hasFocus]);

  useEffect(() => {
    if (search) {
      dispatch(analyticsEvent('nav_search', {
        panned: noFly || searchLooking,
      }));
    }
  }, [search]);

  const carLocation = getCarLocation();

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
      ref={mapContainerRef}
      className={classes.mapContainer}
      style={{ height: 200 }}
    >
      <VisibilityHandler onVisible={updateDevice} onInit onDongleId minInterval={60} />
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
        onViewportChange={viewportChange}
        onContextMenu={null}
        mapStyle={MAPBOX_STYLE}
        width="100%"
        height="100%"
        onNativeClick={focus}
        maxPitch={0}
        mapboxApiAccessToken={MAPBOX_TOKEN}
        attributionControl={false}
        dragRotate={false}
        onError={(err) => setState((prev) => ({ ...prev, mapError: err.error.message }))}
      >
        <GeolocateControl
          className={classes.geolocateControl}
          positionOptions={{ enableHighAccuracy: true }}
          showAccuracyCircle={false}
          onGeolocate={onGeolocate}
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
                onMouseEnter={() => toggleCarPinTooltip(true)}
                onMouseLeave={() => toggleCarPinTooltip(false)}
                alt="car-location"
                onClick={() => onCarSelect(carLocation)}
              />
              <div
                className={classes.carPinTooltip}
                ref={carPinTooltipRef}
                style={{ ...carPinTooltipStyle, display: 'none' }}
              >
                {dayjs(carLocation.time).format('h:mm A')}
                ,
                <br />
                {timeFromNow(carLocation.time)}
              </div>
            </Marker>
          )}
      </ReactMapGL>
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
