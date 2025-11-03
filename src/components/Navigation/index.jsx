import { athena as Athena, devices as Devices } from '@commaai/api';
import { Box, Button, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Clear } from '@mui/icons-material';
import * as Sentry from '@sentry/react';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Layer, Marker, Source, WebMercatorViewport } from 'react-map-gl';
import { useSelector } from 'react-redux';
import Colors from '../../colors';
import { PinCarIcon } from '../../icons';
import { navigate } from '../../navigation';
import { timeFromNow } from '../../utils';
import { isIos } from '../../utils/browser.js';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN, networkPositioning, reverseLookup } from '../../utils/geocode';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import * as Utils from './utils';

const MapContainer = styled(Box)({
  borderBottom: `1px solid ${Colors.white10}`,
});

const MapError = styled(Box)({
  position: 'relative',
  marginTop: 20,
  marginLeft: 20,
  '& p': { color: Colors.white50 },
});

const GeolocateControlStyled = styled(GeolocateControl)({
  display: 'none',
});

const SearchSelectBox = styled(Box)({
  borderRadius: 22,
  padding: '12px 16px',
  border: `1px solid ${Colors.white10}`,
  backgroundColor: Colors.grey800,
  color: Colors.white,
  display: 'flex',
  flexDirection: 'column',
});

const SearchSelectBoxHeader = styled(Box)({
  display: 'flex',
  width: '100%',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 10,
});

const SearchSelectBoxTitle = styled(Box)({
  flexBasis: 'auto',
});

const SearchSelectBoxButtons = styled(Box)({
  display: 'flex',
  flexWrap: 'wrap-reverse',
  justifyContent: 'flex-end',
  alignItems: 'flex-end',
});

const BoldTypography = styled(Typography)({
  fontWeight: 600,
});

const PrimeAdTitle = styled(Typography)({
  lineHeight: '31px',
  fontSize: 20,
  fontWeight: 600,
});

const SearchSelectButton = styled(Button)({
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
});

const SearchSelectBoxDetails = styled(Typography)({
  color: Colors.white40,
});

const PrimeAdContainer = styled(SearchSelectBox)({
  backgroundColor: Colors.grey500,
  border: `1px solid ${Colors.grey700}`,
});

const PrimeAdButton = styled(SearchSelectButton)({
  padding: '6px 24px',
  color: Colors.white,
  backgroundColor: Colors.primeBlue50,
  '&:hover': {
    color: Colors.white,
    backgroundColor: Colors.primeBlue200,
  },
});

const Pin = styled(PinCarIcon)({
  width: 20,
  height: 32,
});

const CarPinTooltip = styled(Box)({
  textAlign: 'center',
  borderRadius: 14,
  fontSize: '0.8em',
  padding: '6px 8px',
  border: `1px solid ${Colors.white10}`,
  backgroundColor: Colors.grey800,
  color: Colors.white,
});

const ClearSearchSelect = styled(Clear)({
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
});

const Navigation = () => {
  // Redux state
  const dongleId = useSelector((state) => state.dongleId);
  const device = useSelector((state) => state.device);

  // State
  const [hasFocus, setHasFocus] = useState(false);
  const [carLastLocation, setCarLastLocation] = useState(null);
  const [carLastLocationTime, setCarLastLocationTime] = useState(null);
  const [carNetworkLocation, setCarNetworkLocation] = useState(null);
  const [carNetworkLocationAccuracy, setCarNetworkLocationAccuracy] = useState(null);
  const [geoLocateCoords, setGeoLocateCoords] = useState(null);
  const [searchSelect, setSearchSelect] = useState(null);
  const [searchLooking, setSearchLooking] = useState(false);
  const [noFly, setNoFly] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showPrimeAd, setShowPrimeAd] = useState(true);
  const [viewport, setViewport] = useState({
    ...DEFAULT_LOCATION,
    zoom: 5,
  });
  const [mapError, setMapError] = useState(null);

  // Refs
  const mounted = useRef(false);
  const mapContainerRef = useRef(null);
  const searchSelectBoxRef = useRef(null);
  const primeAdBoxRef = useRef(null);
  const carPinTooltipRef = useRef(null);

  // Helper functions
  const itemLoc = useCallback((item) => {
    if (item.access && item.access.length) {
      return item.access[0];
    }
    return item.position;
  }, []);

  const itemLngLat = useCallback(
    (item, bounds = false) => {
      const pos = itemLoc(item);
      const res = [pos.lng, pos.lat];
      return bounds ? [res, res] : res;
    },
    [itemLoc],
  );

  const getCarLocation = useCallback(() => {
    if (carNetworkLocation && carNetworkLocationAccuracy <= 10000 && (carNetworkLocationAccuracy <= 100 || !carLastLocation)) {
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
  }, [carLastLocation, carLastLocationTime, carNetworkLocation, carNetworkLocationAccuracy]);

  const carLocationCircle = useCallback((carLocation) => {
    const points = 128;
    const km = carLocation.accuracy / 1000;

    const distanceX = km / (111.32 * Math.cos(carLocation.location[1] * (Math.PI / 180)));
    const distanceY = km / 110.574;

    const res = [];
    let theta;
    let x;
    let y;
    for (let i = 0; i < points; i++) {
      theta = (i / points) * (2 * Math.PI);
      x = distanceX * Math.cos(theta);
      y = distanceY * Math.sin(theta);

      res.push([carLocation.location[0] + x, carLocation.location[1] + y]);
    }
    res.push(res[0]);

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [res],
          },
        },
      ],
    };
  }, []);

  const flyToMarkers = useCallback(() => {
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
    }

    if (bounds.length) {
      const bbox = [
        [
          Math.min.apply(
            null,
            bounds.map((e) => e[0][0]),
          ),
          Math.min.apply(
            null,
            bounds.map((e) => e[0][1]),
          ),
        ],
        [
          Math.max.apply(
            null,
            bounds.map((e) => e[1][0]),
          ),
          Math.max.apply(
            null,
            bounds.map((e) => e[1][1]),
          ),
        ],
      ];

      if (Math.abs(bbox[0][0] - bbox[1][0]) < 0.01) {
        bbox[0][0] -= 0.01;
        bbox[0][1] += 0.01;
      }
      if (Math.abs(bbox[1][0] - bbox[1][1]) < 0.01) {
        bbox[1][0] -= 0.01;
        bbox[1][1] += 0.01;
      }

      const bottomBoxHeight = searchSelectBoxRef.current && viewport.height > 200 ? searchSelectBoxRef.current.getBoundingClientRect().height + 10 : 0;

      let rightBoxWidth = 0;
      let topBoxHeight = 0;

      const primeAdBox = primeAdBoxRef.current;
      if (primeAdBox) {
        if (windowWidth < 600) {
          topBoxHeight = Math.max(topBoxHeight, primeAdBox.getBoundingClientRect().height + 10);
        } else {
          rightBoxWidth = primeAdBox.getBoundingClientRect().width + 10;
        }
      }

      const padding = {
        left: 20,
        right: rightBoxWidth + 20,
        top: topBoxHeight + 20,
        bottom: bottomBoxHeight + 20,
      };
      if (viewport.width) {
        try {
          const newVp = new WebMercatorViewport(viewport).fitBounds(bbox, { padding, maxZoom: 10 });
          setViewport(newVp);
        } catch (err) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'nav_flymarkers_viewport' });
        }
      }
    }
  }, [noFly, geoLocateCoords, searchSelect, windowWidth, viewport, itemLngLat, getCarLocation]);

  const checkWebGLSupport = useCallback(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      setMapError('Failed to get WebGL context, your browser or device may not support WebGL.');
    }
  }, []);

  const getDeviceLastLocation = useCallback(async () => {
    if (device.shared) {
      return;
    }
    try {
      const resp = await Devices.fetchLocation(dongleId);
      if (mounted.current) {
        setCarLastLocation([resp.lng, resp.lat]);
        setCarLastLocationTime(resp.time);
      }
    } catch (err) {
      if (!err.message || err.message.indexOf('no_segments_uploaded') === -1) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_fetch_location' });
      }
    }
  }, [dongleId, device.shared]);

  const getDeviceNetworkLocation = useCallback(async () => {
    const payload = {
      method: 'getNetworks',
      jsonrpc: '2.0',
      id: 0,
    };
    try {
      let resp = await Athena.postJsonRpcPayload(dongleId, payload);
      if (!resp.result || Object.keys(resp.result).length === 0 || !mounted.current) {
        return;
      }
      resp = await networkPositioning(resp.result);
      if (resp && mounted.current) {
        setCarNetworkLocation([resp.lng, resp.lat]);
        setCarNetworkLocationAccuracy(resp.accuracy);
      }
    } catch (err) {
      if (mounted.current && (!err.message || err.message.indexOf('{"error": "Device not registered"}') === -1)) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_fetch_network_location' });
      }
    }
  }, [dongleId]);

  const updateDevice = useCallback(() => {
    getDeviceLastLocation();
    getDeviceNetworkLocation();
  }, [getDeviceLastLocation, getDeviceNetworkLocation]);

  const onGeolocate = (pos) => {
    if (pos && pos.coords) {
      setGeoLocateCoords([pos.coords.longitude, pos.coords.latitude]);
    }
  };

  const focus = useCallback(
    (ev) => {
      if (!hasFocus && (!ev || !ev.srcEvent || !ev.srcEvent.path || !mapContainerRef.current || ev.srcEvent.path.includes(mapContainerRef.current))) {
        setHasFocus(true);
      }
    },
    [hasFocus],
  );

  const onCarSelect = useCallback(
    (carLocation) => {
      focus();

      const [lng, lat] = carLocation.location;
      const item = {
        address: {
          label: '',
        },
        position: {
          lng,
          lat,
        },
        resultType: 'car',
        title: '',
      };

      setNoFly(false);
      setSearchSelect(item);
      setSearchLooking(false);

      reverseLookup(carLocation.location, true).then((location) => {
        if (!location) {
          return;
        }

        setSearchSelect((prevSearchSelect) => ({
          ...prevSearchSelect,
          address: {
            label: location.details,
          },
          title: location.place,
        }));
      });
    },
    [focus],
  );

  const clearSearchSelect = () => {
    setNoFly(false);
    setSearchSelect(null);
    setSearchLooking(false);
  };

  const onResize = (newWindowWidth) => {
    setWindowWidth(newWindowWidth);
  };

  const toggleCarPinTooltip = (visible) => {
    const tooltip = carPinTooltipRef.current;
    if (tooltip) {
      tooltip.style.display = visible ? 'block' : 'none';
    }
  };

  const viewportChange = useCallback(
    (newViewport, interactionState) => {
      setViewport(newViewport);

      if (interactionState.isPanning || interactionState.isZooming || interactionState.isRotating) {
        focus();

        if (!searchSelect && !searchLooking) {
          setSearchLooking(true);
          setNoFly(true);
        }
      }
    },
    [focus, searchSelect, searchLooking],
  );

  const onContainerRef = (el) => {
    mapContainerRef.current = el;
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  };

  const renderSearchOverlay = () => {
    const carLocation = getCarLocation();

    const title = device.alias;
    const { lat, lng } = searchSelect.position;

    let geoUri;
    if (isIos()) {
      geoUri = `https://maps.apple.com/?ll=${lat},${lng}&q=${title}`;
    } else {
      geoUri = `https://maps.google.com/?q=${lat},${lng}`;
    }

    return (
      <SearchSelectBox ref={searchSelectBoxRef}>
        <ClearSearchSelect onClick={clearSearchSelect} />
        <SearchSelectBoxHeader>
          <SearchSelectBoxTitle>
            <BoldTypography>{title}</BoldTypography>
            <SearchSelectBoxDetails>{timeFromNow(carLocation.time)}</SearchSelectBoxDetails>
          </SearchSelectBoxTitle>
          <SearchSelectBoxButtons>
            <SearchSelectButton target="_blank" href={geoUri}>
              open in maps
            </SearchSelectButton>
          </SearchSelectBoxButtons>
        </SearchSelectBoxHeader>
        <SearchSelectBoxDetails>
          {Utils.formatPlaceName(searchSelect)}
          {Utils.formatPlaceAddress(searchSelect)}
        </SearchSelectBoxDetails>
      </SearchSelectBox>
    );
  };

  const renderPrimeAd = () => {
    return (
      <PrimeAdContainer ref={primeAdBoxRef}>
        <ClearSearchSelect
          onClick={() => {
            setShowPrimeAd(false);
            flyToMarkers();
          }}
        />
        <SearchSelectBoxHeader>
          <SearchSelectBoxTitle>
            <PrimeAdTitle>comma prime</PrimeAdTitle>
          </SearchSelectBoxTitle>
          <SearchSelectBoxButtons>
            <PrimeAdButton onClick={() => navigate(`/${dongleId}/prime`)} className="primeSignUp">
              sign up
            </PrimeAdButton>
          </SearchSelectBoxButtons>
        </SearchSelectBoxHeader>
        <SearchSelectBoxDetails>Put your car on the internet with comma prime</SearchSelectBoxDetails>
      </PrimeAdContainer>
    );
  };

  // Set mounted on initial mount
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Check WebGL support on mount
  useEffect(() => {
    checkWebGLSupport();
  }, [checkWebGLSupport]);

  // Update device on mount and when device changes
  useEffect(() => {
    updateDevice();
  }, [updateDevice]);

  // Fly to markers when location states change
  useEffect(() => {
    flyToMarkers();
  }, [flyToMarkers]);

  // Reset state when dongleId changes
  useEffect(() => {
    if (dongleId) {
      setHasFocus(false);
      setCarLastLocation(null);
      setCarLastLocationTime(null);
      setCarNetworkLocation(null);
      setCarNetworkLocationAccuracy(null);
      setGeoLocateCoords(null);
      setSearchSelect(null);
      setSearchLooking(false);
      setNoFly(false);
      setWindowWidth(window.innerWidth);
      setShowPrimeAd(true);
    }
  }, [dongleId]);

  const carLocation = getCarLocation();

  const cardStyle =
    windowWidth < 600
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
    <MapContainer ref={onContainerRef} style={{ height: 200 }}>
      <ResizeHandler onResize={onResize} />
      <VisibilityHandler onVisible={updateDevice} onInit onDongleId minInterval={60} />
      {mapError && (
        <MapError>
          <Typography>Could not initialize map.</Typography>
          <Typography>{mapError}</Typography>
        </MapError>
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
        onError={(err) => setMapError(err.error.message)}
      >
        <GeolocateControlStyled
          positionOptions={{ enableHighAccuracy: true }}
          showAccuracyCircle={false}
          onGeolocate={onGeolocate}
          auto={hasFocus}
          fitBoundsOptions={{ maxZoom: 10 }}
          trackUserLocation
          onViewportChange={() => {}}
        />
        {carLocation && (
          <Marker
            latitude={carLocation.location[1]}
            longitude={carLocation.location[0]}
            offsetLeft={-10}
            offsetTop={-30}
            captureDrag={false}
            captureClick
            captureDoubleClick={false}
          >
            <Pin onMouseEnter={() => toggleCarPinTooltip(true)} onMouseLeave={() => toggleCarPinTooltip(false)} alt="car-location" onClick={() => onCarSelect(carLocation)} />
            <CarPinTooltip ref={carPinTooltipRef} style={{ ...carPinTooltipStyle, display: 'none' }}>
              {dayjs(carLocation.time).format('h:mm A')}
              ,
              <br />
              {timeFromNow(carLocation.time)}
            </CarPinTooltip>
          </Marker>
        )}
        {carLocation && Boolean(carLocation.accuracy) && (
          <Source type="geojson" data={carLocationCircle(carLocation)}>
            <Layer id="polygon" type="fill" source="polygon" layout={{}} paint={{ 'fill-color': '#31a1ee', 'fill-opacity': 0.3 }} />
          </Source>
        )}
        {searchSelect && (
          <HTMLOverlay redraw={renderSearchOverlay} captureScroll captureDrag captureClick captureDoubleClick capturePointerMove style={{ ...cardStyle, bottom: 10 }} />
        )}
        {showPrimeAd && !device.prime && device.is_owner && (
          <HTMLOverlay
            redraw={renderPrimeAd}
            captureScroll
            captureDrag
            captureClick
            captureDoubleClick
            capturePointerMove
            style={{ ...cardStyle, top: 10, left: windowWidth < 600 ? 10 : 'auto', right: 10 }}
          />
        )}
      </ReactMapGL>
    </MapContainer>
  );
};

export default Navigation;
