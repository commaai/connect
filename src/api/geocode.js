import Raven from 'raven-js';
import qs from 'query-string';

export const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mbxDirections = require('@mapbox/mapbox-sdk/services/directions');

let geocodingClient = null;
let directionsClient = null;
if (MAPBOX_TOKEN) {
  geocodingClient = mbxGeocoding({ accessToken: MAPBOX_TOKEN });
  directionsClient = mbxDirections({ accessToken: MAPBOX_TOKEN });
} else {
  console.warn('Missing mapbox token');
}

export default function geocodeApi() {
  function getNeighborhood(context) {
    return (context.id.indexOf('neighborhood') !== -1);
  }

  function getLocality(context) {
    return (context.id.indexOf('place') !== -1);
  }

  function getRegion(context) {
    return (context.id.indexOf('region') !== -1);
  }

  return {
    async reverseLookup(coords) {
      if (geocodingClient === null) {
        return null;
      }

      const response = await geocodingClient.reverseGeocode({
        query: [coords[0], coords[1]],
        limit: 1,
      }).send();

      try {
        const { features } = response.body;
        if (features.length && features[0].context) {
          let region = features[0].context.filter(getRegion)[0].short_code;
          if (region.indexOf('US-') !== -1) { region = region.substr(3); }
          const locality = features[0].context.filter(getLocality)[0].text;
          const _neighborhood = features[0].context.filter(getNeighborhood)[0];
          const neighborhood = _neighborhood ? _neighborhood.text : locality;

          return {
            region,
            locality,
            neighborhood,
          };
        }
      } catch (err) {
        Raven.captureException(err);
      }
    },

    async forwardLookup(query, proximity) {
      let params = {
        apiKey: process.env.REACT_APP_HERE_API_KEY,
        q: query,
        limit: 20,
        details: '1',
      };
      if (proximity) {
        params.at = `${proximity[1]},${proximity[0]}`;
      } else {
        params.in = 'bbox:-180,-90,180,90';
      }

      try {
        const resp = await fetch(`https://autosuggest.search.hereapi.com/v1/autosuggest?${qs.stringify(params)}`, {
          method: 'GET',
        });
        if (resp.ok) {
          const json = await resp.json();
          return json.items;
        }
      } catch (err) {
        console.log(err);
      }
    },

    async getDirections(points) {
      if (!directionsClient) {
        return null;
      }

      const resp = await directionsClient.getDirections({
        profile: 'driving-traffic',
        waypoints: points.map((p) => { return { coordinates: p }; }),
        annotations: ['distance', 'duration'],
        geometries: 'geojson',
        overview: 'full',
      }).send();

      return resp.body.routes;
    },
  };
}
