// Web Mercator viewport math, a dependency free port of the parts of
// viewport-mercator-project (@math.gl/web-mercator) that connect uses.
//
// World coordinates are pixels on the 512x512 zoom 0 tile, y increasing north.
// Screen coordinates are pixels from the top left of the viewport.

const TILE_SIZE = 512;
// Average circumference (40075 km equatorial, 40007 km meridional)
const EARTH_CIRCUMFERENCE = 40.03e6;
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const PI_4 = Math.PI / 4;

// Latitude that makes a square world, 2 * atan(E ** PI) - PI / 2
export const MAX_LATITUDE = 85.051129;

// mapbox camera altitude, in screen heights
export const DEFAULT_ALTITUDE = 1.5;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'mercator: assertion failed.');
  }
}

function clamp(x, min, max) {
  if (x < min) return min;
  return x > max ? max : x;
}

export function zoomToScale(zoom) {
  return 2 ** zoom;
}

export function scaleToZoom(scale) {
  return Math.log2(scale);
}

/**
 * Project [lng, lat] onto [x, y] on the 512x512 Mercator zoom 0 tile.
 */
export function lngLatToWorld(lngLat) {
  const [lng, lat] = lngLat;
  assert(Number.isFinite(lng));
  assert(Number.isFinite(lat) && lat >= -90 && lat <= 90, 'invalid latitude');

  const lambda2 = lng * DEGREES_TO_RADIANS;
  const phi2 = lat * DEGREES_TO_RADIANS;
  const x = (TILE_SIZE * (lambda2 + Math.PI)) / (2 * Math.PI);
  const y = (TILE_SIZE * (Math.PI + Math.log(Math.tan(PI_4 + phi2 * 0.5)))) / (2 * Math.PI);
  return [x, y];
}

/**
 * Unproject world point [x, y] onto [lng, lat] on the sphere.
 */
export function worldToLngLat(xy) {
  const [x, y] = xy;
  const lambda2 = (x / TILE_SIZE) * (2 * Math.PI) - Math.PI;
  const phi2 = 2 * (Math.atan(Math.exp((y / TILE_SIZE) * (2 * Math.PI) - Math.PI)) - PI_4);
  return [lambda2 * RADIANS_TO_DEGREES, phi2 * RADIANS_TO_DEGREES];
}

/** World units per meter at a given latitude. */
export function unitsPerMeter(latitude) {
  return TILE_SIZE / EARTH_CIRCUMFERENCE / Math.cos(latitude * DEGREES_TO_RADIANS);
}

export function altitudeToFovy(altitude) {
  return 2 * Math.atan(0.5 / altitude) * RADIANS_TO_DEGREES;
}

export function fovyToAltitude(fovy) {
  return 0.5 / Math.tan(0.5 * fovy * DEGREES_TO_RADIANS);
}

function getPaddingObject(padding = 0) {
  if (typeof padding === 'number') {
    return { top: padding, bottom: padding, left: padding, right: padding };
  }

  assert(Number.isFinite(padding.top) && Number.isFinite(padding.bottom)
    && Number.isFinite(padding.left) && Number.isFinite(padding.right));

  return padding;
}

/**
 * Map settings { longitude, latitude, zoom } containing the given bounds.
 * Only supports non-perspective mode.
 *
 * @param {object} options
 * @param {number} options.width viewport width
 * @param {number} options.height viewport height
 * @param {number[][]} options.bounds [[lng, lat], [lng, lat]]
 * @param {number} [options.minExtent] the bounded area is never smaller than this, in world units
 * @param {number} [options.maxZoom]
 * @param {number|object} [options.padding] pixels, or { top, bottom, left, right }
 * @param {number[]} [options.offset] center of the bounds relative to the map center, in pixels
 */
export function fitBounds(options) {
  const {
    width,
    height,
    bounds,
    minExtent = 0,
    maxZoom = 24,
    offset = [0, 0],
  } = options;

  const [[west, south], [east, north]] = bounds;
  const padding = getPaddingObject(options.padding);

  const nw = lngLatToWorld([west, clamp(north, -MAX_LATITUDE, MAX_LATITUDE)]);
  const se = lngLatToWorld([east, clamp(south, -MAX_LATITUDE, MAX_LATITUDE)]);

  // width/height on the Web Mercator plane
  const size = [
    Math.max(Math.abs(se[0] - nw[0]), minExtent),
    Math.max(Math.abs(se[1] - nw[1]), minExtent),
  ];

  const targetSize = [
    width - padding.left - padding.right - Math.abs(offset[0]) * 2,
    height - padding.top - padding.bottom - Math.abs(offset[1]) * 2,
  ];

  assert(targetSize[0] > 0 && targetSize[1] > 0);

  // screen pixels per world unit
  const scaleX = targetSize[0] / size[0];
  const scaleY = targetSize[1] / size[1];

  const offsetX = (padding.right - padding.left) / 2 / scaleX;
  const offsetY = (padding.top - padding.bottom) / 2 / scaleY;

  const center = [(se[0] + nw[0]) / 2 + offsetX, (se[1] + nw[1]) / 2 + offsetY];
  const centerLngLat = worldToLngLat(center);
  const zoom = Math.min(maxZoom, Math.log2(Math.abs(Math.min(scaleX, scaleY))));

  assert(Number.isFinite(zoom));

  return {
    longitude: centerLngLat[0],
    latitude: centerLngLat[1],
    zoom,
  };
}

/**
 * Markers are placed by projecting in JavaScript, so they render even when the map itself failed
 * to load.
 */
export default class WebMercatorViewport {
  constructor(props = { width: 1, height: 1 }) {
    const {
      latitude = 0,
      longitude = 0,
      zoom = 0,
      pitch = 0,
      bearing = 0,
      position = null,
      nearZMultiplier = 0.02,
      farZMultiplier = 1.01,
    } = props;
    let { width, height, altitude = null, fovy = null } = props;

    // silently allow 0x0 to facilitate isomorphic render
    width = width || 1;
    height = height || 1;

    if (fovy === null && altitude === null) {
      altitude = DEFAULT_ALTITUDE;
      fovy = altitudeToFovy(altitude);
    } else if (fovy === null) {
      fovy = altitudeToFovy(altitude);
    } else if (altitude === null) {
      altitude = fovyToAltitude(fovy);
    }
    altitude = Math.max(0.75, altitude);

    const scale = zoomToScale(zoom);
    const worldUnitsPerMeter = unitsPerMeter(latitude);
    const center = [...lngLatToWorld([longitude, latitude]), 0];
    if (position) {
      center[0] += position[0] * worldUnitsPerMeter;
      center[1] += position[1] * worldUnitsPerMeter;
      center[2] += position[2] * worldUnitsPerMeter;
    }

    this.width = width;
    this.height = height;
    this.latitude = latitude;
    this.longitude = longitude;
    this.zoom = zoom;
    this.pitch = pitch;
    this.bearing = bearing;
    this.altitude = altitude;
    this.fovy = fovy;
    this.scale = scale;
    this.center = center;
    this.meterOffset = position || [0, 0, 0];
    this.unitsPerMeter = worldUnitsPerMeter;

    // camera basis, applied as translate(-center) -> scale -> rotateZ(bearing) -> rotateX(-pitch)
    const bearingRadians = bearing * DEGREES_TO_RADIANS;
    const pitchRadians = pitch * DEGREES_TO_RADIANS;
    this._cosBearing = Math.cos(bearingRadians);
    this._sinBearing = Math.sin(bearingRadians);
    this._cosPitch = Math.cos(pitchRadians);
    this._sinPitch = Math.sin(pitchRadians);
    // focal length, 1 / tan(fovy / 2)
    this._focalLength = 1 / Math.tan(0.5 * fovy * DEGREES_TO_RADIANS);
    this._aspect = width / height;

    const fovRadians = fovy * DEGREES_TO_RADIANS;
    const focalDistance = fovyToAltitude(fovy);
    const cameraToSeaLevelDistance = focalDistance
      + (center[2] * scale) / Math.cos(pitchRadians) / height;
    const fovAboveCenter = fovRadians * 0.5;
    const topHalfSurfaceDistance = (Math.sin(fovAboveCenter) * cameraToSeaLevelDistance)
      / Math.sin(clamp(Math.PI / 2 - pitchRadians - fovAboveCenter, 0.01, Math.PI - 0.01));
    const furthestDistance = Math.sin(pitchRadians) * topHalfSurfaceDistance
      + cameraToSeaLevelDistance;
    this._near = nearZMultiplier;
    this._far = Math.min(furthestDistance * farZMultiplier, cameraToSeaLevelDistance * 10);
  }

  /** Project [lng, lat] onto the zoom 0 tile, without the camera transform. */
  projectFlat(lngLat) {
    return lngLatToWorld(lngLat);
  }

  unprojectFlat(xy) {
    return worldToLngLat(xy);
  }

  /** [lng, lat, elevation in meters] to world coordinates. */
  projectPosition(xyz) {
    const [X, Y] = lngLatToWorld(xyz);
    return [X, Y, (xyz[2] || 0) * this.unitsPerMeter];
  }

  unprojectPosition(xyz) {
    const [X, Y] = worldToLngLat(xyz);
    return [X, Y, (xyz[2] || 0) / this.unitsPerMeter];
  }

  /**
   * Project [lng, lat] or [lng, lat, elevation] to screen pixels.
   * Returns top left coordinates unless options.topLeft is false.
   */
  project(lngLatZ, options = {}) {
    const { topLeft = true } = options;
    const coord = this._worldToPixels(this.projectPosition(lngLatZ));

    const [x, y] = coord;
    const y2 = topLeft ? y : this.height - y;
    return lngLatZ.length === 2 ? [x, y2] : [x, y2, coord[2]];
  }

  /**
   * Unproject screen pixels to [lng, lat], or [lng, lat, elevation] when a depth or a targetZ
   * is given.
   */
  unproject(xyz, options = {}) {
    const { topLeft = true, targetZ = undefined } = options;
    const [x, y, z] = xyz;

    const y2 = topLeft ? y : this.height - y;
    const targetZWorld = targetZ && targetZ * this.unitsPerMeter;
    const coord = this._pixelsToWorld([x, y2, z], targetZWorld);
    const [X, Y, Z] = this.unprojectPosition(coord);

    if (Number.isFinite(z)) {
      return [X, Y, Z];
    }
    return Number.isFinite(targetZ) ? [X, Y, targetZ] : [X, Y];
  }

  /**
   * Viewport framing the given bounds.
   * @param {number[][]} bounds [[lng, lat], [lng, lat]]
   * @returns {WebMercatorViewport}
   */
  fitBounds(bounds, options = {}) {
    const { width, height } = this;
    const { longitude, latitude, zoom } = fitBounds({ width, height, bounds, ...options });
    return new WebMercatorViewport({ width, height, longitude, latitude, zoom });
  }

  /** Map center that places [lng, lat] at screen position [x, y]. */
  getMapCenterByLngLatPosition({ lngLat, pos }) {
    const fromLocation = this._pixelsToWorld([pos[0], pos[1]]);
    const toLocation = lngLatToWorld(lngLat);
    return worldToLngLat([
      this.center[0] + toLocation[0] - fromLocation[0],
      this.center[1] + toLocation[1] - fromLocation[1],
    ]);
  }

  /** World coordinates to camera space, the view matrix expanded. */
  _worldToCamera(xyz) {
    const { center, height, scale } = this;
    const s = scale / height;
    const x = s * (xyz[0] - center[0]);
    const y = s * (xyz[1] - center[1]);
    const z = s * ((xyz[2] || 0) - center[2]);

    const bx = x * this._cosBearing - y * this._sinBearing;
    const by = x * this._sinBearing + y * this._cosBearing;

    return [
      bx,
      by * this._cosPitch + z * this._sinPitch,
      (-by * this._sinPitch + z * this._cosPitch) - this.altitude,
    ];
  }

  _cameraToWorld(xyz) {
    const { center, height, scale } = this;
    const y = xyz[1];
    const z = xyz[2] + this.altitude;

    const by = y * this._cosPitch - z * this._sinPitch;
    const bz = y * this._sinPitch + z * this._cosPitch;

    const x = xyz[0] * this._cosBearing + by * this._sinBearing;
    const y2 = -xyz[0] * this._sinBearing + by * this._cosBearing;

    const s = height / scale;
    return [center[0] + x * s, center[1] + y2 * s, center[2] + bz * s];
  }

  _worldToPixels(xyz) {
    assert(Number.isFinite(xyz[0]) && Number.isFinite(xyz[1]));

    const [x, y, z] = this._worldToCamera(xyz);
    const w = -z;
    const ndcX = ((this._focalLength / this._aspect) * x) / w;
    const ndcY = (this._focalLength * y) / w;
    const { _near: near, _far: far } = this;
    const ndcZ = (((far + near) / (near - far)) * z + (2 * far * near) / (near - far)) / w;

    return [
      ((ndcX + 1) * this.width) / 2,
      ((1 - ndcY) * this.height) / 2,
      ndcZ,
    ];
  }

  _pixelsToWorld(xyz, targetZ = 0) {
    const [x, y, z] = xyz;
    assert(Number.isFinite(x) && Number.isFinite(y), 'invalid pixel coordinate');

    const ndcX = (2 * x) / this.width - 1;
    const ndcY = 1 - (2 * y) / this.height;
    // ray from the camera through the pixel, in camera space
    const dirX = (ndcX * this._aspect) / this._focalLength;
    const dirY = ndcY / this._focalLength;

    let t;
    if (Number.isFinite(z)) {
      const { _near: near, _far: far } = this;
      // invert the perspective depth
      t = ((2 * far * near) / (near - far)) / (z + (far + near) / (near - far));
    } else {
      // distance along the ray at which it crosses the targetZ plane
      const cameraZ = (this.scale / this.height) * ((targetZ || 0) - this.center[2]);
      t = (cameraZ - this.altitude * this._cosPitch)
        / (dirY * this._sinPitch - this._cosPitch);
    }

    return this._cameraToWorld([t * dirX, t * dirY, -t]);
  }
}
