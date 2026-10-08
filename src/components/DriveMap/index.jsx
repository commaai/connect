import React, { Component } from 'react';
import { connect } from 'react-redux';

import ReactMapGL, { LinearInterpolator } from 'react-map-gl';

import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';

const INTERACTION_TIMEOUT = 5000;
export function getRouteFeatureCollection(routes) {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((route) => {
      if (!route.driveCoords) {
        return [];
      }

      const coordinates = Object.keys(route.driveCoords)
        .sort((a, b) => Number(a) - Number(b))
        .map((time) => route.driveCoords[time])
        .filter((coordinate) => (
          Array.isArray(coordinate)
          && coordinate.length >= 2
          && Number.isFinite(coordinate[0])
          && Number.isFinite(coordinate[1])
        ));
      if (coordinates.length < 2) {
        return [];
      }

      return [{
        type: 'Feature',
        properties: { fullname: route.fullname },
        geometry: { type: 'LineString', coordinates },
      }];
    }),
  };
}

export function getRoutesBounds(routes) {
  const coordinates = routes.flatMap((route) => {
    const pathCoordinates = route.driveCoords
      ? Object.values(route.driveCoords).filter((coordinate) => (
        Array.isArray(coordinate)
        && coordinate.length >= 2
        && Number.isFinite(coordinate[0])
        && Number.isFinite(coordinate[1])
      ))
      : [];
    if (pathCoordinates.length > 0) {
      return pathCoordinates;
    }
    return [
      [route.start_lng, route.start_lat],
      [route.end_lng, route.end_lat],
    ].filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
  });

  if (coordinates.length === 0) {
    return null;
  }

  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

export class DriveMap extends Component {
  constructor(props) {
    super(props);

    this.state = {
      viewport: {
        ...DEFAULT_LOCATION,
        zoom: 14,
      },
      driveCoordsMin: null,
      driveCoordsMax: null,
    };

    this.onRef = this.onRef.bind(this);
    this.onViewportChange = this.onViewportChange.bind(this);
    this.initMap = this.initMap.bind(this);
    this.populateMap = this.populateMap.bind(this);
    this.posAtOffset = this.posAtOffset.bind(this);
    this.setPath = this.setPath.bind(this);
    this.updateMarkerPos = this.updateMarkerPos.bind(this);
    this.onInteraction = this.onInteraction.bind(this);
    this.onMapLoad = this.onMapLoad.bind(this);

    this.shouldFlyTo = false;
    this.isInteracting = false;
    this.isInteractingTimeout = null;
    this.lastMapPos = [0, 0];
  }

  componentDidMount() {
    this.mounted = true;
    this.componentDidUpdate({}, {});
    this.updateMarkerPos();
  }

  componentDidUpdate(prevProps) {
    const { dispatch, currentRoute, startTime } = this.props;

    const prevRoute = prevProps.currentRoute?.fullname || null;
    const route = currentRoute?.fullname || null;
    if (prevRoute !== route) {
      this.setPath([]);
      if (route) {
        dispatch(fetchDriveCoords(currentRoute));
      }
    }

    if (prevProps.startTime && prevProps.startTime !== startTime) {
      this.shouldFlyTo = true;
    }

    if (currentRoute && prevProps.currentRoute && currentRoute.driveCoords
      && prevProps.currentRoute.driveCoords !== currentRoute.driveCoords) {
      this.shouldFlyTo = false;
      const keys = Object.keys(currentRoute.driveCoords);
      this.setState({
        driveCoordsMin: Math.min(...keys),
        driveCoordsMax: Math.max(...keys),
      });
      this.populateMap();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    const map = this.map && this.map.getMap();
    if (map && typeof map.off === 'function') {
      map.off('load', this.onMapLoad);
    }
  }

  onInteraction(ev) {
    if (ev.isDragging || ev.isRotating || ev.isZooming) {
      this.shouldFlyTo = true;
      this.isInteracting = true;

      if (this.isInteractingTimeout !== null) {
        clearTimeout(this.isInteractingTimeout);
      }
      this.isInteractingTimeout = setTimeout(() => {
        this.isInteracting = false;
      }, INTERACTION_TIMEOUT);
    }
  }

  updateMarkerPos() {
    if (!this.mounted) {
      return;
    }

    const markerSource = this.map && this.map.getMap().getSource('seekPoint');
    if (markerSource) {
      if (this.props.currentRoute && this.props.currentRoute.driveCoords) {
        const pos = this.posAtOffset(currentOffset());
        if (pos && pos.some((coordinate, index) => coordinate != this.lastMapPos[index])) {
          this.lastMapPos = pos;
          markerSource.setData({
            type: 'Point',
            coordinates: pos,
          });
          if (!this.isInteracting) {
            this.moveViewportTo(pos);
          }
        }
      } else if (markerSource._data && markerSource._data.coordinates.length > 0) {
        markerSource.setData({
          type: 'Point',
          coordinates: [],
        });
      }
    }

    requestAnimationFrame(this.updateMarkerPos);
  }

  moveViewportTo(pos) {
    const viewport = {
      longitude: pos[0],
      latitude: pos[1],
    };
    if (this.shouldFlyTo) {
      viewport.transitionDuration = 200;
      viewport.transitionInterpolator = new LinearInterpolator();
      this.shouldFlyTo = false;
    }

    this.setState((prevState) => ({
      viewport: {
        ...prevState.viewport,
        ...viewport,
      },
    }));
  }

  async populateMap() {
    const { currentRoute } = this.props;

    if (!this.map || !currentRoute || !currentRoute.driveCoords) {
      return;
    }

    this.setPath(Object.values(currentRoute.driveCoords));
  }

  onRef(el) {
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  }

  onViewportChange(viewport) {
    this.setState({ viewport });
  }

  setPath(coords) {
    const map = this.map && this.map.getMap();
    const routeSource = map && map.getSource('route');

    if (!routeSource) {
      return;
    }

    routeSource.setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    });
  }

  posAtOffset(offset) {
    const { currentRoute } = this.props;
    if (!currentRoute.driveCoords) {
      return null;
    }

    const offsetSeconds = Math.floor(offset / 1e3);
    const offsetFractionalPart = (offset % 1e3) / 1000.0;
    const coordIdx = Math.max(this.state.driveCoordsMin, Math.min(
      offsetSeconds,
      this.state.driveCoordsMax,
    ));
    const nextCoordIdx = Math.max(this.state.driveCoordsMin, Math.min(
      offsetSeconds + 1,
      this.state.driveCoordsMax,
    ));

    if (!currentRoute.driveCoords[coordIdx]) {
      return null;
    }

    const [floorLng, floorLat] = currentRoute.driveCoords[coordIdx];
    if (!currentRoute.driveCoords[nextCoordIdx]) {
      return [floorLng, floorLat];
    }

    const [ceilLng, ceilLat] = currentRoute.driveCoords[nextCoordIdx];
    return [
      floorLng + ((ceilLng - floorLng) * offsetFractionalPart),
      floorLat + ((ceilLat - floorLat) * offsetFractionalPart),
    ];
  }

  initMap(mapComponent) {
    if (!mapComponent) {
      this.map = null;
      return;
    }

    const map = mapComponent.getMap();
    if (!map) {
      this.map = null;
      return;
    }
    this.map = mapComponent;

    if (map.loaded()) {
      this.onMapLoad();
    } else {
      map.once('load', this.onMapLoad);
    }
  }

  onMapLoad() {
    const map = this.map && this.map.getMap();
    if (!map) {
      return;
    }
    if (!map.getSource('route')) {
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        },
      });
      map.addSource('seekPoint', {
        type: 'geojson',
        data: {
          type: 'Point',
          coordinates: [],
        },
      });

      const lineGeoJson = {
        id: 'routeLine',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#888',
          'line-width': 8,
        },
      };
      map.addLayer(lineGeoJson);

      const markerGeoJson = {
        id: 'marker',
        type: 'circle',
        paint: {
          'circle-radius': 10,
          'circle-color': '#007cbf',
        },
        source: 'seekPoint',
      };

      map.addLayer(markerGeoJson);
    }

    const { currentRoute } = this.props;
    if (currentRoute?.driveCoords) {
      this.shouldFlyTo = false;
      const keys = Object.keys(currentRoute.driveCoords);
      this.setState({
        driveCoordsMin: Math.min(...keys),
        driveCoordsMax: Math.max(...keys),
      });
      this.populateMap();
    }
  }

  render() {
    const { viewport } = this.state;
    return (
      <div ref={this.onRef} className="h-full cursor-default [&_div]:h-full [&_div]:w-full [&_div]:min-h-[300px]">
        <ReactMapGL
          width="100%"
          height="100%"
          latitude={viewport.latitude}
          longitude={viewport.longitude}
          zoom={viewport.zoom}
          mapStyle={MAPBOX_STYLE}
          maxPitch={0}
          mapboxApiAccessToken={MAPBOX_TOKEN}
          ref={this.initMap}
          onContextMenu={null}
          dragRotate={false}
          onViewportChange={this.onViewportChange}
          attributionControl={false}
          onInteractionStateChange={this.onInteraction}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  offset: state.offset,
  currentRoute: state.currentRoute,
  startTime: state.startTime,
});

export default connect(stateToProps)(DriveMap);
