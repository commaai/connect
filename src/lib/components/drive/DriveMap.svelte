<script>
  import mapboxgl from 'mapbox-gl';
  import { untrack } from 'svelte';

  import 'mapbox-gl/src/css/mapbox-gl.css';

  import { playback } from '$lib/state/playback.svelte.js';
  import { fetchDriveCoords, getRouteDriveCoords } from '$lib/state/routes.svelte.js';
  import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '$lib/utils/geocode';
  import { keepTouch } from '$lib/attachments/keep-touch';

  let { route } = $props();

  const INTERACTION_TIMEOUT = 5000;

  // The camera. mapbox follows it, and reports its own moves back into it.
  let viewport = $state({ ...DEFAULT_LOCATION, zoom: 14, bearing: 0, pitch: 0 });

  let containerEl = $state(null);
  let mapContainerEl = $state(null);
  let mapEl = $state(null);

  let map = $state(null);
  let mapLoaded = $state(false);

  let shouldFlyTo = false;
  let flyNext = false;
  let isInteracting = false;
  let isInteractingTimeout = null;
  let lastMapPos = [0, 0];
  // Set while pushing the viewport into mapbox, so the move it fires back does
  // not overwrite what we just asked for.
  let syncing = false;

  const driveCoords = $derived(route ? getRouteDriveCoords(route.fullname) : null);

  const driveCoordsRange = $derived.by(() => {
    if (!driveCoords) {
      return null;
    }
    const keys = Object.keys(driveCoords);
    return { min: Math.min(...keys), max: Math.max(...keys) };
  });

  function setPath(coords) {
    if (!map || !mapLoaded) {
      return;
    }
    map.getSource('route').setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    });
  }

  function posAtOffset(offset) {
    const coords = driveCoords;
    const range = driveCoordsRange;
    if (!coords || !range) {
      return null;
    }

    const offsetSeconds = Math.floor(offset / 1e3);
    const offsetFractionalPart = (offset % 1e3) / 1000.0;
    const coordIdx = Math.max(range.min, Math.min(offsetSeconds, range.max));
    const nextCoordIdx = Math.max(range.min, Math.min(offsetSeconds + 1, range.max));

    if (!coords[coordIdx]) {
      return null;
    }

    const [floorLng, floorLat] = coords[coordIdx];
    if (!coords[nextCoordIdx]) {
      return [floorLng, floorLat];
    }

    const [ceilLng, ceilLat] = coords[nextCoordIdx];
    return [
      floorLng + ((ceilLng - floorLng) * offsetFractionalPart),
      floorLat + ((ceilLat - floorLat) * offsetFractionalPart),
    ];
  }

  function moveViewportTo(pos) {
    if (shouldFlyTo) {
      flyNext = true;
      shouldFlyTo = false;
    }

    viewport = { ...viewport, longitude: pos[0], latitude: pos[1] };
  }

  // onInteractionStateChange, for isDragging/isZooming/isRotating.
  function onInteraction() {
    shouldFlyTo = true;
    isInteracting = true;

    if (isInteractingTimeout !== null) {
      clearTimeout(isInteractingTimeout);
    }
    isInteractingTimeout = setTimeout(() => {
      isInteracting = false;
    }, INTERACTION_TIMEOUT);
  }

  // StaticMap observed its container and kept the canvas in sync with it;
  // mapbox 1.x only watches window resize on its own.
  $effect(() => {
    const el = mapContainerEl;
    if (!el) return;

    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(el);
    return () => observer.disconnect();
  });

  $effect(() => {
    const el = mapEl;
    if (!el) return;

    const { latitude, longitude, zoom, bearing, pitch } = untrack(() => ({ ...viewport }));

    let instance;
    try {
      instance = new mapboxgl.Map({
        container: el,
        style: MAPBOX_STYLE,
        accessToken: MAPBOX_TOKEN,
        center: [longitude, latitude],
        zoom,
        bearing,
        pitch,
        maxPitch: 0,
        dragRotate: false,
        attributionControl: false,
      });
    } catch (err) {
      console.error(err);
      return;
    }

    instance.on('error', (event) => console.error(event.error));

    instance.on('move', () => {
      if (syncing) return;
      const center = instance.getCenter();
      viewport = {
        latitude: center.lat,
        longitude: center.lng,
        zoom: instance.getZoom(),
        bearing: instance.getBearing(),
        pitch: instance.getPitch(),
      };
    });

    ['dragstart', 'drag', 'zoomstart', 'zoom', 'rotatestart', 'rotate'].forEach((event) => {
      instance.on(event, onInteraction);
    });

    instance.on('load', () => {
      instance.addSource('route', {
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
      instance.addSource('seekPoint', {
        type: 'geojson',
        data: {
          type: 'Point',
          coordinates: [],
        },
      });

      instance.addLayer({
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
      });

      instance.addLayer({
        id: 'marker',
        type: 'circle',
        paint: {
          'circle-radius': 10,
          'circle-color': '#007cbf',
        },
        source: 'seekPoint',
      });

      mapLoaded = true;
    });

    map = instance;

    return () => {
      mapLoaded = false;
      map = null;
      instance.remove();
    };
  });

  // The map is controlled: mapbox follows the viewport, never the other way
  // round, except for the moves it reports back above.
  $effect(() => {
    const { latitude, longitude, zoom, bearing, pitch } = viewport;
    const instance = map;
    if (!instance) return;

    untrack(() => {
      const center = instance.getCenter();
      if (center.lng === longitude && center.lat === latitude && instance.getZoom() === zoom
        && instance.getBearing() === bearing && instance.getPitch() === pitch) {
        return;
      }
      const fly = flyNext;
      flyNext = false;
      syncing = true;
      if (fly) {
        instance.easeTo({
          center: [longitude, latitude],
          zoom,
          bearing,
          pitch,
          duration: 200,
          easing: (t) => t,
        });
      } else {
        instance.jumpTo({ center: [longitude, latitude], zoom, bearing, pitch });
      }
      syncing = false;
    });
  });

  let prevRouteName = null;
  $effect(() => {
    const currentRoute = route;
    const name = currentRoute?.fullname || null;

    untrack(() => {
      if (prevRouteName === name) return;
      prevRouteName = name;
      setPath([]);
      if (name) {
        fetchDriveCoords(currentRoute);
      }
    });
  });

  // A seek moves the camera with a transition rather than a jump.
  let prevStartTime = null;
  $effect(() => {
    const { startTime } = playback;

    untrack(() => {
      if (prevStartTime && prevStartTime !== startTime) {
        shouldFlyTo = true;
      }
      prevStartTime = startTime;
    });
  });

  $effect(() => {
    const coords = driveCoords;
    const loaded = mapLoaded;
    if (!coords || !loaded) return;

    untrack(() => {
      shouldFlyTo = false;
      setPath($state.snapshot(Object.values(coords)));
    });
  });

  // The seek point moves every frame, so it is written straight into the
  // source instead of going through the reactive graph.
  $effect(() => {
    let frame = requestAnimationFrame(function updateMarkerPos() {
      frame = requestAnimationFrame(updateMarkerPos);

      const markerSource = mapLoaded && map && map.getSource('seekPoint');
      if (!markerSource) {
        return;
      }

      if (driveCoords) {
        const pos = posAtOffset(playback.currentOffset());
        if (pos && pos.some((coordinate, index) => coordinate !== lastMapPos[index])) {
          lastMapPos = pos;
          markerSource.setData({
            type: 'Point',
            coordinates: pos,
          });
          if (!isInteracting) {
            moveViewportTo(pos);
          }
        }
      } else if (markerSource._data && markerSource._data.coordinates.length > 0) {
        markerSource.setData({
          type: 'Point',
          coordinates: [],
        });
      }
    });

    return () => cancelAnimationFrame(frame);
  });

  $effect(() => () => {
    if (isInteractingTimeout !== null) {
      clearTimeout(isInteractingTimeout);
      isInteractingTimeout = null;
    }
  });
</script>

<div bind:this={containerEl} {@attach keepTouch()} class="driveMap h-full cursor-default [&_div]:h-full [&_div]:w-full [&_div]:min-h-[300px]">
  <div style="position: relative; width: 100%; height: 100%; cursor: grab">
    <div bind:this={mapContainerEl} style="position: relative; width: 100%; height: 100%">
      <div bind:this={mapEl} style="position: absolute; width: 100%; height: 100%; overflow: hidden; visibility: inherit"></div>

      <!-- StaticMap rendered this once the map existed. DriveMap draws the route
           and the seek point as GL layers, so it stays empty. -->
      {#if map}
        <div class="overlays" style="position: absolute; width: 100%; height: 100%; overflow: hidden"></div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* mapbox binds its handlers inside the map element, i.e. underneath this
     overlay layer — so the layer has to be transparent to pointers. */
  .driveMap :global(.overlays) {
    pointer-events: none;
  }
</style>
