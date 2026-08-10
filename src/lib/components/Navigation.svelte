<script>
  import * as Sentry from '@sentry/browser';
  import dayjs from 'dayjs';
  import mapboxgl from 'mapbox-gl';
  import { tick, untrack } from 'svelte';
  import { innerWidth } from 'svelte/reactivity/window';

  import 'mapbox-gl/src/css/mapbox-gl.css';

  import { watchReturn } from '$lib/state/page-active';
  import { devices as Devices } from '$lib/api';
  import { formatPlaceAddress, formatPlaceName } from '$lib/navigation/utils';
  import { timeFromNow } from '$lib/utils';
  import { isIos } from '$lib/utils/browser';
  import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN, reverseLookup } from '$lib/utils/geocode';
  import WebMercatorViewport from '$lib/utils/mercator';
  import { keepTouch } from '$lib/attachments/keep-touch';

  let { dongleId, device, onprimenav, onanalytics } = $props();

  let hasFocus = $state(false);
  let carLastLocation = $state(null);
  let carLastLocationTime = $state(null);
  let geoLocateCoords = $state(null);
  let searchSelect = $state(null);
  let searchLooking = $state(false);
  let noFly = $state(false);
  let showPrimeAd = $state(true);
  let mapError = $state(null);
  // React declared `search` in its state shape but never assigned it, so every
  // branch reading it is dead. Kept so flyToMarkers stays a faithful port.
  let search = $state(null);

  // The camera, driven by flyToMarkers and by the map's own move events. The
  // measured size is kept out of it: fitBounds returns a fresh object each
  // time, and an effect that both read and wrote it would never settle.
  let viewport = $state({ ...DEFAULT_LOCATION, zoom: 5, bearing: 0, pitch: 0 });
  let mapWidth = $state(0);
  let mapHeight = $state(0);

  let containerEl = $state(null);
  let mapContainerEl = $state(null);
  let mapEl = $state(null);
  let searchSelectBoxEl = $state(null);
  let primeAdBoxEl = $state(null);
  let carPinTooltipEl = $state(null);

  let map = $state(null);
  let geolocateControl = $state(null);
  // Set while pushing the viewport into mapbox, so the move it fires back does
  // not overwrite what we just asked for.
  let syncing = false;

  const windowWidth = $derived(innerWidth.current ?? 1280);

  const carLocation = $derived(carLastLocation
    ? { location: carLastLocation, accuracy: 0, time: carLastLocationTime }
    : null);

  // react-map-gl projected markers in JavaScript rather than asking mapbox, so
  // they are placed even when the map itself failed to load.
  const projection = $derived(new WebMercatorViewport({
    ...viewport,
    width: mapWidth,
    height: mapHeight,
  }));

  // react-map-gl/src/utils/crisp-pixel
  const pixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const crispPixel = (size) => Math.round(size * pixelRatio) / pixelRatio;

  const markerTransform = $derived.by(() => {
    if (!carLocation) return null;
    const [x, y] = projection.project(carLocation.location);
    // Marker offsetLeft={-10} offsetTop={-30}
    return `translate(${crispPixel(x - 10)}px, ${crispPixel(y - 30)}px)`;
  });

  const carPinTooltipTransform = $derived.by(() => {
    if (!carLocation) return 'translate(calc(-50% + 10px), -4px)';
    const pixelsAvailable = mapHeight - projection.project(carLocation.location)[1];
    return pixelsAvailable < 50
      ? 'translate(calc(-50% + 10px), -81px)'
      : 'translate(calc(-50% + 10px), -4px)';
  });

  // HTMLOverlay's base style merged with cardStyle, resolved
  const primeAdOverlayStyle = $derived(windowWidth < 600
    ? 'position: absolute; z-index: 4; width: auto; height: auto; top: 10px; bottom: auto; left: 10px; right: 10px'
    : 'position: absolute; z-index: 4; width: 360px; height: auto; top: 10px; bottom: auto; left: auto; right: 10px');

  const searchSelectOverlayStyle = $derived(windowWidth < 600
    ? 'position: absolute; z-index: 4; width: auto; height: auto; top: auto; bottom: 10px; left: 10px; right: 10px'
    : 'position: absolute; z-index: 4; width: 360px; height: auto; top: auto; bottom: 10px; left: 10px');

  const primeAdDetails = $derived(device?.eligible_features?.commacare
    ? 'Put your car on the internet with comma prime and extend your 1-year limited warranty with commacare'
    : 'Put your car on the internet with comma prime');

  const geoUri = $derived.by(() => {
    if (!searchSelect) return '';
    const { lat, lng } = searchSelect.position;
    return isIos()
      ? `https://maps.apple.com/?ll=${lat},${lng}&q=${device?.alias}`
      : `https://maps.google.com/?q=${lat},${lng}`;
  });

  // styles.searchSelectBox, and styles.primeAdContainer layered over it. Written
  // out separately so no two conflicting Tailwind utilities meet on one element.
  const searchSelectBox = 'flex flex-col rounded-[22px] border border-white/10 bg-[#272c2f] px-4 py-3 text-white';
  const primeAdContainer = 'flex flex-col rounded-[22px] border border-[#303639] bg-[#424a4f] px-4 py-3 text-white';
  // styles.clearSearchSelect
  const clearSearchSelect = 'absolute top-[-8px] left-[-6px] h-6 w-6 shrink-0 cursor-pointer select-none'
    + ' rounded-[12px] border border-[#394044] bg-[#1e2224] p-[5px] text-white hover:bg-[#303639]';
  // MuiButton root + styles.searchSelectButton, minus the contained variant's
  // shadow and 36px min-height — this Button is a flat one.
  const buttonBase = 'relative ml-2 inline-flex min-h-0 min-w-16 max-w-[125px] grow cursor-pointer select-none'
    + ' items-center justify-center rounded-[15px] py-[6px] align-middle text-[0.875rem] font-medium outline-none';

  function checkWebGLSupport() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      mapError = 'Failed to get WebGL context, your browser or device may not support WebGL.';
    }
  }

  function focus() {
    if (!hasFocus) {
      hasFocus = true;
    }
  }

  function itemLoc(item) {
    if (item.access && item.access.length) {
      return item.access[0];
    }
    return item.position;
  }

  function itemLngLat(item, bounds = false) {
    const pos = itemLoc(item);
    const res = [pos.lng, pos.lat];
    return bounds ? [res, res] : res;
  }

  function carLocationCircle(location) {
    const points = 128;
    const km = location.accuracy / 1000;

    const distanceX = km / (111.320 * Math.cos(location.location[1] * (Math.PI / 180)));
    const distanceY = km / 110.574;

    const res = [];
    for (let i = 0; i < points; i += 1) {
      const theta = (i / points) * (2 * Math.PI);
      res.push([
        location.location[0] + distanceX * Math.cos(theta),
        location.location[1] + distanceY * Math.sin(theta),
      ]);
    }
    res.push(res[0]);

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [res] },
      }],
    };
  }

  function flyToMarkers() {
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

    if (!bounds.length) {
      return;
    }

    const bbox = [[
      Math.min.apply(null, bounds.map((e) => e[0][0])),
      Math.min.apply(null, bounds.map((e) => e[0][1])),
    ], [
      Math.max.apply(null, bounds.map((e) => e[1][0])),
      Math.max.apply(null, bounds.map((e) => e[1][1])),
    ]];

    // Both degenerate-bbox fixes touch the wrong element, which nudges a single
    // point's fit north west. Preserved: it is what the map has always shown.
    if (Math.abs(bbox[0][0] - bbox[1][0]) < 0.01) {
      bbox[0][0] -= 0.01;
      bbox[0][1] += 0.01;
    }
    if (Math.abs(bbox[1][0] - bbox[1][1]) < 0.01) {
      bbox[1][0] -= 0.01;
      bbox[1][1] += 0.01;
    }

    // The map is 199px tall, so this is never taken.
    const bottomBoxHeight = (searchSelectBoxEl && mapHeight > 200)
      ? searchSelectBoxEl.getBoundingClientRect().height + 10 : 0;

    let rightBoxWidth = 0;
    let topBoxHeight = 0;

    if (primeAdBoxEl) {
      if (windowWidth < 600) {
        topBoxHeight = Math.max(topBoxHeight, primeAdBoxEl.getBoundingClientRect().height + 10);
      } else {
        rightBoxWidth = primeAdBoxEl.getBoundingClientRect().width + 10;
      }
    }

    const padding = {
      left: (windowWidth < 600 || !search) ? 20 : 390,
      right: rightBoxWidth + 20,
      top: topBoxHeight + 20,
      bottom: bottomBoxHeight + 20,
    };

    if (mapWidth) {
      try {
        const newVp = new WebMercatorViewport({ ...viewport, width: mapWidth, height: mapHeight })
          .fitBounds(bbox, { padding, maxZoom: 10 });
        viewport = {
          latitude: newVp.latitude,
          longitude: newVp.longitude,
          zoom: newVp.zoom,
          bearing: newVp.bearing,
          pitch: newVp.pitch,
        };
      } catch (err) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_flymarkers_viewport' });
      }
    }
  }

  function onGeolocate(pos) {
    const coords = pos?.coords;
    if (coords) {
      geoLocateCoords = [coords.longitude, coords.latitude];
    }
  }

  function toggleCarPinTooltip(visible) {
    if (carPinTooltipEl) {
      carPinTooltipEl.style.display = visible ? 'block' : 'none';
    }
  }

  function clearSearchSelectBox() {
    noFly = false;
    searchSelect = null;
    searchLooking = false;
  }

  async function onCarSelect(location) {
    focus();

    const [lng, lat] = location.location;
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

    // item never carries a distance; React sent it anyway.
    onanalytics?.('nav_search_select', { source: 'car', panned: noFly, distance: item.distance });

    noFly = false;
    searchSelect = item;
    searchLooking = false;

    const place = await reverseLookup(location.location, true);
    if (!place || !searchSelect) {
      return;
    }
    searchSelect = {
      ...searchSelect,
      address: { label: place.details },
      title: place.place,
    };
  }

  async function getDeviceLastLocation(id) {
    if (!device || device.shared) {
      return;
    }
    try {
      const resp = await Devices.fetchLocation(id);
      if (id === dongleId) {
        carLastLocation = [resp.lng, resp.lat];
        carLastLocationTime = resp.time;
      }
    } catch (err) {
      if (!err.message || err.message.indexOf('no_segments_uploaded') === -1) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'nav_fetch_location' });
      }
    }
  }

  // componentDidUpdate: a new dongle resets everything back to initialState.
  let lastDongleId = null;
  $effect(() => {
    const id = dongleId;
    untrack(() => {
      if (lastDongleId === id) return;
      lastDongleId = id;
      hasFocus = false;
      carLastLocation = null;
      carLastLocationTime = null;
      geoLocateCoords = null;
      searchSelect = null;
      searchLooking = false;
      noFly = false;
      showPrimeAd = true;
    });
  });

  const refreshLocation = watchReturn(() => getDeviceLastLocation(dongleId), { minInterval: 60 });

  $effect(() => {
    const id = dongleId;
    const dev = device;
    untrack(() => {
      if (dev) getDeviceLastLocation(id);
      // that counts as the refresh for this device
      refreshLocation.reset();
    });
  });

  $effect(refreshLocation);

  // StaticMap observed its container and fed the size into the projection.
  $effect(() => {
    const el = mapContainerEl;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        mapWidth = rect.width;
        mapHeight = rect.height;
        // mapbox 1.x only watches window resize, so a container resize that is
        // not a window resize would leave the canvas stale while the marker is
        // projected at the new size.
        map?.resize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  $effect(() => {
    const el = mapEl;
    if (!el) return;

    checkWebGLSupport();
    // StaticMap.supported(): with no WebGL nothing inside the map renders.
    if (!mapboxgl.supported()) return;

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
      Sentry.captureException(err, { fingerprint: 'nav_map_create' });
      return;
    }

    // mapError is never cleared once set, and a map error overwrites the more
    // specific WebGL message.
    instance.on('error', (event) => {
      mapError = event.error?.message ?? String(event.error ?? event.type);
    });

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

    const onInteraction = () => {
      if (syncing) return;
      focus();
      if (search && !searchSelect && !searchLooking) {
        searchLooking = true;
        noFly = true;
      }
    };
    instance.on('dragstart', onInteraction);
    instance.on('zoomstart', onInteraction);
    instance.on('rotatestart', onInteraction);
    instance.on('click', () => focus());

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      showAccuracyCircle: false,
      trackUserLocation: true,
      fitBoundsOptions: { maxZoom: 10 },
    });
    geolocate.on('geolocate', onGeolocate);
    // react-map-gl replaced _updateCamera and routed it through
    // onViewportChange={() => {}}, so geolocating never moved the map here.
    // flyToMarkers does the framing.
    geolocate._updateCamera = () => {};
    instance.addControl(geolocate);
    geolocateControl = geolocate;

    map = instance;

    return () => {
      geolocateControl = null;
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
      syncing = true;
      instance.jumpTo({ center: [longitude, latitude], zoom, bearing, pitch });
      syncing = false;
    });
  });

  // carLocation.accuracy is always 0, so the circle Source/Layer is never added.
  $effect(() => {
    const instance = map;
    if (!instance) return;

    const circle = carLocation && carLocation.accuracy ? carLocationCircle(carLocation) : null;
    if (!circle) return;

    const add = () => {
      if (instance.getSource('polygon')) return;
      instance.addSource('polygon', { type: 'geojson', data: circle });
      instance.addLayer({
        id: 'polygon',
        type: 'fill',
        source: 'polygon',
        layout: {},
        paint: { 'fill-color': '#31a1ee', 'fill-opacity': 0.3 },
      });
    };
    if (instance.isStyleLoaded()) add();
    else instance.once('styledata', add);
  });

  // GeolocateControl auto={hasFocus}
  $effect(() => {
    if (!hasFocus || !geolocateControl) return;
    untrack(() => {
      try {
        geolocateControl.trigger();
      } catch {
        // The control refuses to trigger without geolocation permission.
      }
    });
  });

  let hadFocus = false;
  $effect(() => {
    const focused = hasFocus;
    if (focused && !hadFocus) {
      untrack(() => onanalytics?.('nav_focus', { has_car_location: Boolean(carLastLocation) }));
    }
    hadFocus = focused;
  });

  // componentDidUpdate flew on a new car location, on the FIRST geolocate, and
  // on any non-null searchSelect. It never re-fit on resize, so mapWidth is only
  // a gate: fitBounds needs a measured map before the first fit can happen.
  let prevCarLastLocation = null;
  let prevGeoLocateCoords = null;
  let prevSearchSelect = null;
  let flyPending = false;
  $effect(() => {
    const car = carLastLocation;
    const geo = geoLocateCoords;
    const sel = searchSelect;
    const width = mapWidth;

    untrack(() => {
      if (car !== prevCarLastLocation || (sel && sel !== prevSearchSelect) || (geo && !prevGeoLocateCoords)) {
        flyPending = true;
      }
      prevCarLastLocation = car;
      prevGeoLocateCoords = geo;
      prevSearchSelect = sel;

      if (flyPending && width) {
        flyPending = false;
        flyToMarkers();
      }
    });
  });
</script>

{#snippet clearIcon(onclear)}
  <!-- @material-ui/icons/Clear -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    class={clearSearchSelect}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    onclick={onclear}
  >
    <g><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></g>
  </svg>
{/snippet}

<div bind:this={containerEl} {@attach keepTouch()} class="navMap border-b border-white/10" style="height: 200px">
  {#if mapError}
    <div class="relative mt-5 ml-5">
      <p class="text-[0.875rem] text-white/50" style="line-height: 1.46429em">Could not initialize map.</p>
      <p class="text-[0.875rem] text-white/50" style="line-height: 1.46429em">{mapError}</p>
    </div>
  {/if}

  <!-- react-map-gl's event canvas, map container and canvas host. The error
       block above pushes it down and it overflows the 200px container, exactly
       as in the original. -->
  <div style="position: relative; width: 100%; height: 100%; cursor: grab">
    <div bind:this={mapContainerEl} style="position: relative; width: 100%; height: 100%">
      <div bind:this={mapEl} style="position: absolute; width: 100%; height: 100%; overflow: hidden; visibility: inherit"></div>

      {#if map}
        <div class="overlays" style="position: absolute; width: 100%; height: 100%; overflow: hidden">
          {#if carLocation}
            <div class="mapboxgl-marker" style="position: absolute; left: 0; top: 0; transform: {markerTransform}; cursor: auto">
              <!-- PinCarIcon -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <svg
                class="h-8 w-5 shrink-0 select-none"
                viewBox="0 0 5.95 8.467"
                fill="currentColor"
                style="font-size: 24px"
                alt="car-location"
                aria-hidden="true"
                focusable="false"
                onmouseenter={() => toggleCarPinTooltip(true)}
                onmouseleave={() => toggleCarPinTooltip(false)}
                onclick={() => onCarSelect(carLocation)}
              >
                <path
                  d="M4.233 288.533c-1.373 0-2.975.84-2.975 2.975 0 1.45 2.289 4.653 2.975 5.492.61-.84 2.975-3.966 2.975-5.492 0-2.136-1.602-2.975-2.975-2.975z"
                  style="fill:#31a1ee;fill-opacity:1;stroke-width:0.56445432"
                  transform="translate(-1.258 -288.533)"
                />
                <path
                  d="M6.238 291.337a.463.463 0 0 0-.355-.447l-.429-1a.154.154 0 0 0-.141-.095H3.154a.154.154 0 0 0-.136.086l-.434 1.006a.463.463 0 0 0-.355.45v1.08h.308v.307a.308.308 0 1 0 .617 0v-.308h2.159v.308a.308.308 0 1 0 .616 0v-.308h.309zm-2.991-1.234H5.22l.324.771H2.923Zm-.401 1.85a.308.308 0 1 1 0-.616.308.308 0 0 1 0 .616zm2.775 0a.308.308 0 1 1 0-.616.308.308 0 0 1 0 .616z"
                  style="fill:#fff;stroke-width:0.30835694"
                  transform="translate(-1.258 -288.533)"
                />
              </svg>
              <div
                bind:this={carPinTooltipEl}
                class="rounded-[14px] border border-white/10 bg-[#272c2f] px-2 py-[6px] text-center text-[0.8em] text-white"
                style="display: none"
                style:transform={carPinTooltipTransform}
              >
                {dayjs(carLocation.time).format('h:mm A')},<br />{timeFromNow(carLocation.time)}
              </div>
            </div>
          {/if}

          {#if searchSelect}
            <div style={searchSelectOverlayStyle}>
              <div bind:this={searchSelectBoxEl} class={searchSelectBox}>
                {@render clearIcon(clearSearchSelectBox)}
                <div class="mb-[10px] flex w-full items-start justify-between">
                  <div class="basis-auto">
                    <p class="text-[0.875rem] font-semibold" style="line-height: 1.46429em">{device?.alias}</p>
                    <p class="text-[0.875rem] text-white/40" style="line-height: 1.46429em">
                      {carLocation ? timeFromNow(carLocation.time) : ''}
                    </p>
                  </div>
                  <div class="flex flex-wrap-reverse items-end justify-end">
                    <a
                      class="{buttonBase} bg-white px-3 text-[#1e2224] no-underline hover:bg-[#ddd]"
                      style="line-height: 1.4em"
                      href={geoUri}
                      target="_blank"
                      rel="noreferrer"
                      tabindex="0"
                    >
                      <span class="w-full" style="display: inherit; align-items: inherit; justify-content: inherit">open in maps</span>
                    </a>
                  </div>
                </div>
                <p class="text-[0.875rem] text-white/40" style="line-height: 1.46429em">
                  {formatPlaceName(searchSelect)}{formatPlaceAddress(searchSelect)}
                </p>
              </div>
            </div>
          {/if}

          {#if showPrimeAd && !device?.prime && device?.is_owner}
            <div style={primeAdOverlayStyle}>
              <div bind:this={primeAdBoxEl} class={primeAdContainer}>
                {@render clearIcon(async () => { showPrimeAd = false; await tick(); flyToMarkers(); })}
                <div class="mb-[10px] flex w-full items-start justify-between">
                  <div class="basis-auto">
                    <p class="text-[20px] font-semibold" style="line-height: 31px">comma prime</p>
                  </div>
                  <div class="flex flex-wrap-reverse items-end justify-end">
                    <button
                      type="button"
                      class="primeSignUp {buttonBase} bg-[#5e8bff] px-6 text-white hover:bg-[#547de6]"
                      style="line-height: 1.4em"
                      onclick={() => onprimenav?.(true)}
                    >
                      <span class="w-full" style="display: inherit; align-items: inherit; justify-content: inherit">sign up</span>
                    </button>
                  </div>
                </div>
                <!-- classes.primeAdDetails does not exist, so this is plain body1 -->
                <p class="text-[0.875rem]" style="line-height: 1.46429em">{primeAdDetails}</p>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* classes.geolocateControl: the control renders, but never paints. */
  .navMap :global(.mapboxgl-ctrl-top-right) {
    display: none;
  }

  /* react-map-gl created the map with interactive:false and ran interaction
     itself on an ancestor of this div, so overlays could sit on top harmlessly.
     mapbox binds its handlers inside the map element, i.e. underneath — so the
     overlay layer has to be transparent to pointers or the map is dead. Each
     child opts back in, matching Marker/HTMLOverlay's capture* flags. */
  .navMap :global(.overlays) {
    pointer-events: none;
  }

  .navMap :global(.overlays > *) {
    pointer-events: auto;
  }
</style>
