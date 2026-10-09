import React, { Component } from 'react';
import { connect } from 'react-redux';
import ReactMapGL from 'react-map-gl';

import { fetchDriveCoords } from '../../actions/cached';
import { currentOffset } from '../../timeline';
import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';
import { buildCoordIndex, headingAtOffset, positionAtOffset, shortestTurn } from './position';

const ZOOM = 15.5;
// share of the remaining turn applied each frame, so the map swings smoothly into the new heading
const TURN_RATE = 0.12;

// Car marker, fixed at the centre and always pointing up: the map turns around it.
const CarArrow = () => (
  <svg
    className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M12 2 19 21 12 17 5 21Z" fill="#fff" stroke="#1D2225" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

// A small map laid over the video that follows the car, heading up, like a game minimap.
class MiniMap extends Component {
  constructor(props) {
    super(props);

    this.state = {
      viewport: {
        ...DEFAULT_LOCATION,
        zoom: ZOOM,
        bearing: 0,
      },
    };

    this.initMap = this.initMap.bind(this);
    this.update = this.update.bind(this);

    this.map = null;
    this.frame = null;
    this.coordSource = null;
    this.coordIndex = null;
    this.bearing = null;
  }

  componentDidMount() {
    this.fetchCoords();
    this.frame = requestAnimationFrame(this.update);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      this.fetchCoords();
    }
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frame);
  }

  // the full map fetches these too, but it is not mounted while the minimap is shown
  fetchCoords() {
    const { currentRoute, dispatch } = this.props;
    if (currentRoute) {
      dispatch(fetchDriveCoords(currentRoute));
    }
  }

  initMap(mapComponent) {
    const map = mapComponent?.getMap?.();
    if (!map) {
      this.map = null;
      return;
    }

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: 'routeLine',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#888', 'line-width': 5 },
      });
      this.map = map;
      this.setPath();
    });
  }

  setPath() {
    if (this.map && this.coordIndex) {
      this.map.getSource('route').setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: this.coordIndex.coords },
      });
    }
  }

  // follows playback every frame, like the marker on the full map
  update() {
    const coords = this.props.currentRoute?.driveCoords;
    if (coords) {
      if (coords !== this.coordSource) {
        this.coordSource = coords;
        this.coordIndex = buildCoordIndex(coords);
        this.bearing = null;
        this.setPath();
      }

      const offset = currentOffset();
      const pos = positionAtOffset(this.coordIndex, offset);
      if (pos) {
        const heading = headingAtOffset(this.coordIndex, offset);
        if (heading !== null) {
          // first heading snaps, later ones turn smoothly; while stopped the last heading is kept
          this.bearing = this.bearing === null ? heading : this.bearing + (shortestTurn(this.bearing, heading) * TURN_RATE);
          this.bearing = (this.bearing + 360) % 360;
        }
        const { viewport } = this.state;
        const bearing = this.bearing ?? 0;
        if (viewport.longitude !== pos[0] || viewport.latitude !== pos[1] || Math.abs(viewport.bearing - bearing) > 0.05) {
          this.setState({ viewport: { ...viewport, longitude: pos[0], latitude: pos[1], bearing } });
        }
      }
    }
    this.frame = requestAnimationFrame(this.update);
  }

  render() {
    const { onExpand } = this.props;
    const { viewport } = this.state;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Open map"
        onClick={onExpand}
        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') onExpand(); }}
        className="absolute bottom-3 left-3 z-[60] aspect-[4/3] h-[45%] max-h-[180px] cursor-pointer overflow-hidden rounded-xl border-2 border-white/25 bg-[#1D2225] shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
      >
        <div className="pointer-events-none h-full w-full">
          <ReactMapGL
            width="100%"
            height="100%"
            latitude={viewport.latitude}
            longitude={viewport.longitude}
            zoom={viewport.zoom}
            bearing={viewport.bearing}
            mapStyle={MAPBOX_STYLE}
            maxPitch={0}
            mapboxApiAccessToken={MAPBOX_TOKEN}
            ref={this.initMap}
            attributionControl={false}
          />
        </div>
        <CarArrow />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(MiniMap);
