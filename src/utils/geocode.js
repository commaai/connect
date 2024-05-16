import * as Sentry from '@sentry/react';
import qs from 'query-string';
import { WebMercatorViewport } from 'react-map-gl';

import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import mbxDirections from '@mapbox/mapbox-sdk/services/directions';

export const DEFAULT_LOCATION = {
  latitude: 32.711483,
  longitude: -117.161052,
};

export const MAPBOX_STYLE = 'mapbox://styles/commaai/cjj4yzqk201c52ss60ebmow0w';
export const MAPBOX_TOKEN = 'pk.eyJ1IjoiY29tbWFhaSIsImEiOiJjangyYXV0c20wMGU2NDluMWR4amUydGl5In0.6Vb11S6tdX6Arpj6trRE_g';
const HERE_API_KEY = 'O0atgmTwzKnwYJL2hk5N5qqG2R9y78f5GdHlvr_mtiw';

const geocodingClient = mbxGeocoding({ accessToken: MAPBOX_TOKEN });
const directionsClient = mbxDirections({ accessToken: MAPBOX_TOKEN });

export function getFilteredContexts(context) {
  const includeCtxs = ['region', 'district', 'place', 'locality', 'neighborhood'];
  return context.filter((ctx) => includeCtxs.some((c) => ctx.id.indexOf(c) !== -1));
}

function getContextString(context) {
  if (context.id.indexOf('region') !== -1 && context.short_code) {
    if (context.short_code.indexOf('US-') !== -1) {
      return context.short_code.substr(3);
    }
    return context.short_code;
  }
  return context.text;
}

function getContextMap(context) {
  const map = {};
  context.forEach((ctx) => {
    const key = ctx.id.split('.', 1)[0];
    map[key] = getContextString(ctx);
  });
  return map;
}

/**
 * Shorten street suffixes like "Street" to "St".
 * https://en.wikipedia.org/wiki/Street_or_road_name#Suffix_abbreviations
 *
 * Don't shorten:
 * - Bridge
 * - Embankment
 * - Gardens
 * - Gate
 * - Grove
 * - Hill
 * - Mall
 * - Row
 * - Square
 * - Terrace
 * - Walk
 * - Way
 */
const STREET_SUFFIXES = {
  Avenue: 'Ave',
  Boulevard: 'Blvd',
  Circle: 'Cir',
  Close: 'Cl',
  Court: 'Ct',
  Crescent: 'Cres',
  Drive: 'Dr',
  Expressway: 'Expy',
  Highway: 'Hwy',
  Lane: 'Ln',
  Place: 'Pl',
  Road: 'Rd',
  Street: 'St',
};

const STREET_DIRECTIONS = {
  North: 'N',
  Northeast: 'NE',
  East: 'E',
  Southeast: 'SE',
  South: 'S',
  Southwest: 'SW',
  West: 'W',
  Northwest: 'NW',
};

// shorten suffixes like "Street" to "St"
function shortenPlaceName(place) {
  const parts = place.split(' ');
  const newParts = [];

  let last = parts.pop();

  // Shorten direction, which can be at beginning or end of a street name
  const first = parts.shift();
  let direction = STREET_DIRECTIONS[first];
  if (direction) {
    parts.unshift(direction);
  } else {
    parts.unshift(first);

    direction = STREET_DIRECTIONS[last];
    if (direction) {
      newParts.push(direction);
      last = parts.pop();
    }
  }

  // Shorten suffix
  const suffix = STREET_SUFFIXES[last];
  if (suffix) {
    newParts.push(suffix);
  }

  parts.push(...newParts.reverse());
  return parts.join(' ');
}

export function priorityGetContext(contexts) {
  const priority = ['place', 'locality', 'district'];
  return priority.flatMap((prio) => contexts.filter((ctx) => ctx.id.indexOf(prio) !== -1))[0];
}

export async function reverseLookup(coords, navFormat = false) {
  if (geocodingClient === null || (coords[0] === 0 && coords[1] === 0)) {
    return null;
  }

  const endpoint = 'https://api.mapbox.com/geocoding/v5/mapbox.places/';
  const params = {
    access_token: MAPBOX_TOKEN,
    limit: 1,
  };

  let resp;
  try {
    resp = await fetch(`${endpoint}${coords[0]},${coords[1]}.json?${qs.stringify(params)}`, {
      method: 'GET',
      cache: 'force-cache',
    });
    if (!resp.ok) {
      return null;
    }
  } catch (err) {
    console.error(err);
    return null;
  }

  try {
    const { features } = await resp.json();
    if (features.length && features[0].context) {
      if (navFormat) {
        // Used for navigation locations API (saving favorites)
        // Try to format location similarly to HERE, which is where the search results come from

        // e.g. Mapbox returns "Street", "Avenue", etc.
        const context = getContextMap(features[0].context);
        // e.g. "State St"
        const place = shortenPlaceName(features[0].text);
        // e.g. "San Diego, CA 92101, United States"

        let postcode;
        if (context.country === 'United Kingdom') {
          postcode = context.postcode;
        } else {
          postcode = `${context.region} ${context.postcode}`;
        }
        const details = `${context.place}, ${postcode}, ${context.country}`;

        return { place, details };
      }
      const contexts = getFilteredContexts(features[0].context);

      // Used for location name/area in drive list
      // e.g. "Little Italy"
      let place = '';
      // e.g. "San Diego, CA"
      let details = '';
      if (contexts.length > 0) {
        place = getContextString(contexts.shift());
      }
      if (contexts.length > 0) {
        details = getContextString(contexts.pop());
      }
      if (contexts.length > 0) {
        details = `${getContextString(priorityGetContext(contexts))}, ${details}`;
      }

      return { place, details };
    }
  } catch (err) {
    Sentry.captureException(err, { fingerprint: 'geocode_reverse_parse' });
  }

  return null;
}

export async function forwardLookup(query, proximity, viewport) {
  if (!query) {
    return [];
  }

  const params = {
    apiKey: HERE_API_KEY,
    q: query,
    limit: 20,
    show: ['details'],
  };
  if (proximity) {
    params.at = `${proximity[1]},${proximity[0]}`;
  } else if (viewport) {
    const bbox = new WebMercatorViewport(viewport).getBounds();
    const vals = [
      Math.max(-180, bbox[0][0]),
      Math.max(-90, bbox[0][1]),
      Math.min(180, bbox[1][0]),
      Math.min(90, bbox[1][1]),
    ];
    params.in = `bbox:${vals.join(',')}`;
  } else {
    params.in = 'bbox:-180,-90,180,90';
  }

  const resp = await fetch(`https://autosuggest.search.hereapi.com/v1/autosuggest?${qs.stringify(params)}`, {
    method: 'GET',
  });
  if (!resp.ok) {
    console.error(resp);
    return [];
  }

  const json = await resp.json();
  return json.items;
}

export async function networkPositioning(req) {
  const resp = await fetch(`https://positioning.hereapi.com/v2/locate?apiKey=${HERE_API_KEY}&fallback=any,singleWifi`, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(req),
  });
  if (!resp.ok) {
    console.error(resp);
    return null;
  }
  const json = await resp.json();
  return json.location;
}

export async function getDirections(points) {
  if (!directionsClient) {
    return null;
  }

  const resp = await directionsClient.getDirections({
    profile: 'driving-traffic',
    waypoints: points.map((p) => ({ coordinates: p })),
    annotations: ['distance', 'duration'],
    geometries: 'geojson',
    overview: 'full',
  }).send();

  return resp.body.routes;
}
