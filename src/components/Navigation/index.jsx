import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';
import mapboxgl from 'mapbox-gl';
import { Typography, Button } from '@material-ui/core';

import { api } from '../../api/backend';
import { analyticsEvent } from '../../actions';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN, reverseLookup } from '../../utils/geocode';
import { Clear, PinCarIcon } from '../../icons';
import { timeFromNow } from '../../utils';
import VisibilityHandler from '../VisibilityHandler';
import * as Utils from './utils';
import { isIos } from '../../utils/browser.js';

mapboxgl.accessToken = MAPBOX_TOKEN;

// TODO: move these into tailwind @theme in index.css
const navigationColors = {
  '--grey-600': '#394044',
  '--grey-700': '#303639',
  '--grey-800': '#272c2f',
  '--grey-900': '#1e2224',
};

const CarLocationCard = ({ device, selectedLocation, carLocation, onClear }) => {
  const { lat, lng } = selectedLocation.position;
  const title = device.alias;

  const mapsUrl = isIos()
    ? `https://maps.apple.com/?ll=${lat},${lng}&q=${title}`
    : `https://maps.google.com/?q=${lat},${lng}`;

  return (
    <div className="flex flex-col rounded-[22px] border border-white/10 bg-[var(--grey-800)] px-4 py-3 text-white">
      <Clear
        className="absolute -top-2 -left-1.5 size-6 cursor-pointer rounded-xl border border-[var(--grey-600)] bg-[var(--grey-900)] p-[5px] text-xl text-white hover:bg-[var(--grey-700)]"
        onClick={onClear}
      />
      <div className="flex w-full items-start justify-between mb-2.5">
        <div>
          <Typography className="font-semibold">{title}</Typography>
          <Typography className="text-white/40">{timeFromNow(carLocation.time)}</Typography>
        </div>
        <Button
          className={`ml-2 min-h-[unset] max-w-[125px] grow
            rounded-[15px] bg-white px-3 py-1.5
            normal-case text-[var(--grey-900)]
            hover:bg-[#ddd] hover:text-[var(--grey-900)]
            disabled:bg-[#ddd] disabled:text-[var(--grey-900)]`}
          target="_blank"
          href={mapsUrl}
        >
          open in maps
        </Button>
      </div>
      <Typography className="text-white/40">
        {Utils.formatPlaceName(selectedLocation)}
        {Utils.formatPlaceAddress(selectedLocation)}
      </Typography>
    </div>
  );
};

const Navigation = ({ dispatch, device, dongleId }) => {
  const dongleIdRef = useRef(dongleId);
  dongleIdRef.current = dongleId;

  const mapContainerRef = useRef(null);
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const geolocateControlRef = useRef(null);
  const carMarkerRef = useRef(null);
  const carPinTooltipRef = useRef(null);
  const prevFlyStateRef = useRef({
    carLocation: null,
    geoLocateCoords: null,
    selectedPosition: null,
  });

  const [hasFocus, setHasFocus] = useState(false);
  const [carLocation, setCarLocation] = useState(null);
  const [geoLocateCoords, setGeoLocateCoords] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [mapError, setMapError] = useState(null);
  const [markerElement] = useState(() => document.createElement('div'));

  const selectedPosition = selectedLocation?.position ?? null;
  const focus = () => setHasFocus(true);

  function toggleCarPinTooltip(visible) {
    const tooltip = carPinTooltipRef.current;
    if (!tooltip) return;

    const map = mapRef.current;
    const marker = carMarkerRef.current;
    if (visible && map && marker) {
      const markerPoint = map.project(marker.getLngLat());
      const pixelsAvailable = map.getContainer().clientHeight - markerPoint.y;

      tooltip.style.transform = pixelsAvailable < 50
        ? 'translate(calc(-50% + 10px), -81px)'
        : 'translate(calc(-50% + 10px), -4px)';
    }
    tooltip.style.display = visible ? 'block' : 'none';
  }

  async function refreshDeviceLocation() {
    // if (device.shared) return;

    // TODO: remove this mock data
    if (device.shared) {
      setCarLocation({
        location: [-121.9886, 37.5485],
        time: new Date().setHours(9, 5, 0, 0),
      });
      return;
    }

    try {
      const resp = await api.devices.fetchLocation(dongleId);
      if (dongleId === dongleIdRef.current) {
        setCarLocation({
          location: [resp.lng, resp.lat],
          time: resp.time,
        });
      }
    } catch (err) {
      if (!err.message || err.message.indexOf('no_segments_uploaded') === -1) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_fetch_location' });
      }
    }
  }

  function onCarSelect(carLoc) {
    focus();

    dispatch(analyticsEvent('nav_search_select', {
      source: 'car',
      panned: false,
    }));

    const [lng, lat] = carLoc.location;

    setSelectedLocation({
      address: {
        label: '',
      },
      position: {
        lng, lat,
      },
      resultType: 'car',
      title: '',
    });

    reverseLookup(carLoc.location, true).then((location) => {
      if (!location) return;

      setSelectedLocation((prev) => {
        if (!prev || prev.position.lng !== lng || prev.position.lat !== lat) {
          return prev;
        }

        return {
          ...prev,
          address: {
            label: location.details,
          },
          title: location.place,
        };
      });
    });
  }

  function flyToMarkers() {
    const map = mapRef.current;
    if (!map) return;

    const bounds = [];
    if (geoLocateCoords) {
      bounds.push([geoLocateCoords, geoLocateCoords]);
    }
    if (carLocation) {
      bounds.push([carLocation.location, carLocation.location]);
    }
    if (selectedPosition) {
      const { lng, lat } = selectedPosition;
      const coordinates = [lng, lat];
      bounds.push([coordinates, coordinates]);
    }
    if (bounds.length) {
      const bbox = [[
        Math.min.apply(null, bounds.map((entry) => entry[0][0])),
        Math.min.apply(null, bounds.map((entry) => entry[0][1])),
      ], [
        Math.max.apply(null, bounds.map((entry) => entry[1][0])),
        Math.max.apply(null, bounds.map((entry) => entry[1][1])),
      ]];

      if (Math.abs(bbox[1][0] - bbox[0][0]) < 0.01) {
        bbox[0][0] -= 0.01; // west
        bbox[1][0] += 0.01; // east
      }
      if (Math.abs(bbox[1][1] - bbox[0][1]) < 0.01) {
        bbox[0][1] -= 0.01; // south
        bbox[1][1] += 0.01; // north
      }

      try {
        map.fitBounds(bbox, {
          padding: 20,
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
    if (!element) return undefined;

    if (!mapboxgl.supported()) {
      setMapError('Failed to get WebGL context, your browser or device may not support WebGL.');
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
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(element);

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

    const handleGeolocate = (event) => {
      if (event.coords) {
        setGeoLocateCoords([event.coords.longitude, event.coords.latitude]);
      }
    };

    map.on('click', focus);

    map.on('movestart', (event) => {
      if (event.originalEvent) focus();
    });

    map.on('error', (event) => setMapError(event.error.message));

    geolocateControl.on('geolocate', handleGeolocate);

    return () => {
      resizeObserver.disconnect();
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
    if (!map || !marker) return;

    if (!carLocation) {
      marker.remove();
      return;
    }

    marker.setLngLat(carLocation.location);

    if (!marker.getElement().parentNode) {
      marker.addTo(map);
    }
  }, [carLocation]);

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
    const prev = prevFlyStateRef.current;
    const shouldFly = (carLocation && prev.carLocation !== carLocation)
      || (geoLocateCoords && !prev.geoLocateCoords)
      || (selectedPosition && prev.selectedPosition !== selectedPosition);
    prevFlyStateRef.current = { carLocation, geoLocateCoords, selectedPosition };
    if (shouldFly) {
      flyToMarkers();
    }
  }, [carLocation, geoLocateCoords, selectedPosition]);

  useEffect(() => {
    setHasFocus(false);
    setCarLocation(null);
    setGeoLocateCoords(null);
    setSelectedLocation(null);
  }, [dongleId]);

  useEffect(() => {
    refreshDeviceLocation();
  }, [device, dongleId]);

  useEffect(() => {
    if (hasFocus) {
      geolocateControlRef.current?.trigger();
      dispatch(analyticsEvent('nav_focus', {
        has_car_location: Boolean(carLocation),
      }));
    }
  }, [hasFocus]);

  return (
    <div
      ref={mapContainerRef}
      style={navigationColors}
      className="relative h-[200px] border-b border-white/10 [&_.mapboxgl-ctrl-geolocate]:hidden"
    >
      <div ref={mapElementRef} className="absolute inset-0 h-full w-full" />
      <VisibilityHandler onVisible={refreshDeviceLocation} minInterval={60} />
      {mapError && (
        <div className="relative z-[1] mt-5 ml-5">
          <Typography className="text-white/50">Could not initialize map.</Typography>
          <Typography className="text-white/50">{mapError}</Typography>
        </div>
      )}
      {carLocation && createPortal(
        <>
          <PinCarIcon
            className="h-8 w-5"
            alt="car-location"
            onMouseEnter={() => toggleCarPinTooltip(true)}
            onMouseLeave={() => toggleCarPinTooltip(false)}
            onClick={() => onCarSelect(carLocation)}
          />
          <div
            ref={carPinTooltipRef}
            className="rounded-[14px] border border-white/10 bg-[var(--grey-800)] px-2 py-1.5 text-center text-[0.8em] text-white"
            style={{ display: 'none' }}
          >
            {new Date(carLocation.time).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
            ,
            <br />
            {timeFromNow(carLocation.time)}
          </div>
        </>,
        markerElement,
      )}
      {selectedLocation && (
        <div className="absolute inset-x-2.5 bottom-2.5 z-[4] w-auto min-[600px]:right-auto min-[600px]:w-[360px]">
          <CarLocationCard
            device={device}
            selectedLocation={selectedLocation}
            carLocation={carLocation}
            onClear={() => setSelectedLocation(null)}
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

export default connect(stateToProps)(Navigation);
