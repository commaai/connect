import { createResource, createSignal, createEffect, onMount, onCleanup, Show, type VoidComponent } from 'solid-js'
import { render } from 'solid-js/web'
import Leaflet, { type MapOptions } from 'leaflet'
import clsx from 'clsx'

import { GPSPathPoint, getCoords } from '~/api/derived'
import CircularProgress from '~/components/material/CircularProgress'
import { getTileUrl } from '~/map'
import type { Route } from '~/types'

import Icon from './material/Icon'
import IconButton from './material/IconButton'

type RoutePlaybackMapProps = {
  class?: string
  route: Route | undefined
  currentTime: number
  setCurrentTime: (time: number) => void
}

const RoutePlaybackMap: VoidComponent<RoutePlaybackMapProps> = (props) => {
  let mapRef!: HTMLDivElement
  let mapContainerRef!: HTMLDivElement
  const [map, setMap] = createSignal<Leaflet.Map | null>(null)
  const [routePath, setRoutePath] = createSignal<Leaflet.Polyline | null>(null)
  const [marker, setMarker] = createSignal<Leaflet.Marker | null>(null) // The marker for the current replay time
  const [markerIcon, setMarkerIcon] = createSignal<Leaflet.DivIcon | null>(null) // The vehicle marker icon
  const [shouldInitMap, setShouldInitMap] = createSignal(false) // Whether the map should be initialized (wait until mount to avoid lag)
  const [autoTracking, setAutoTracking] = createSignal(false) // Is auto-tracking enabled

  // Gesture handling state
  const [showScrollMessage, setShowScrollMessage] = createSignal(false) // Showing the scroll instruction message
  const [isModifierPressed, setIsModifierPressed] = createSignal(false) // Whether the modifier key is pressed for zooming
  const [isMacOS, setIsMacOS] = createSignal(false)
  const [isTouchDevice, setIsTouchDevice] = createSignal(false)
  const [isPointerOverMap, setIsPointerOverMap] = createSignal(false)

  // Get GPS coordinates for the route
  const [coords] = createResource(() => props.route, getCoords)

  // Initialize the visibility observer
  onMount(() => {
    // Detect when map is visible
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldInitMap(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(mapRef)

    // Fallback: initialize after 1.5 seconds even if not visible
    const timeout = setTimeout(() => setShouldInitMap(true), 1500)

    // Detect OS for handling modifier keys
    setIsMacOS(navigator.platform.toUpperCase().indexOf('MAC') >= 0)

    // Detect if we're on a touch device
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)

    // Set up key event listeners for modifier keys (Ctrl/Cmd)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || (isMacOS() && e.metaKey)) {
        setIsModifierPressed(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || (isMacOS() && e.metaKey))) {
        setIsModifierPressed(false)
      }
    }

    // When window loses focus, reset the modifier key state
    const handleBlur = () => {
      setIsModifierPressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    onCleanup(() => {
      observer.disconnect()
      clearTimeout(timeout)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    })
  })

  // Initialize map when shouldInitMap becomes true
  createEffect(() => {
    if (!shouldInitMap()) return

    const tileUrl = getTileUrl()
    const tileLayer = Leaflet.tileLayer(tileUrl)

    const leafletMap = Leaflet.map(mapRef, {
      layers: [tileLayer],
      attributionControl: false,
      zoomControl: true,
      scrollWheelZoom: false, // Disable default scroll wheel zoom
      dragging: true,
    } as MapOptions)

    // Set a default view if no coordinates are available yet
    leafletMap.setView([0, 0], 10)

    // Trigger a resize to ensure the map renders
    setTimeout(() => {
      leafletMap.invalidateSize()
    }, 100)

    setMap(leafletMap)

    // Create marker icon
    const icon = createMarkerIcon()
    setMarkerIcon(icon)

    // Monitor resize events to prevent gray tiles
    const observer = new ResizeObserver(() => leafletMap.invalidateSize())
    observer.observe(mapRef)

    // Track mouse position relative to map
    const handleMouseEnter = () => setIsPointerOverMap(true)
    const handleMouseLeave = () => setIsPointerOverMap(false)
    mapContainerRef.addEventListener('mouseenter', handleMouseEnter)
    mapContainerRef.addEventListener('mouseleave', handleMouseLeave)

    let messageTimeout: NodeJS.Timer

    // Custom wheel event handler for the map
    const handleWheel = (e: WheelEvent) => {
      // Only handle events when pointer is over the map
      if (!isPointerOverMap()) return
      if (isModifierPressed()) {
        // Allow zooming when modifier key is pressed
        e.preventDefault() // Prevent browser zoom
        e.stopPropagation()
        setShowScrollMessage(false)

        // Get the current map center and zoom
        const currentCenter = leafletMap.getCenter()
        const currentZoom = leafletMap.getZoom()

        // Get mouse position in pixels
        const containerPoint = leafletMap.mouseEventToContainerPoint(e)
        // Get the geographic point under the cursor
        const targetPoint = leafletMap.containerPointToLatLng(containerPoint)

        // Calculate new zoom level
        const zoomDelta = e.deltaY > 0 ? -1 : 1
        const newZoom = Math.max(leafletMap.getMinZoom(), Math.min(leafletMap.getMaxZoom(), currentZoom + zoomDelta))

        // Calculate the scale factor between the old and new zoom
        const scale = Math.pow(2, newZoom - currentZoom)

        // Calculate a new center that will keep the cursor point in place
        // For zoom in: move center toward cursor, for zoom out: move away
        const newCenter = Leaflet.latLng(
          targetPoint.lat - (targetPoint.lat - currentCenter.lat) / scale,
          targetPoint.lng - (targetPoint.lng - currentCenter.lng) / scale,
        )

        // Apply the new zoom and center in a single operation
        leafletMap.setView(newCenter, newZoom, { animate: true })
      } else {
        setShowScrollMessage(true)
        // Hide message after a delay
        clearTimeout(messageTimeout)
        messageTimeout = setTimeout(() => setShowScrollMessage(false), 1000)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Single finger
        leafletMap.dragging.disable() // Disable dragging
        setShowScrollMessage(true)
        // Hide message after a delay
        clearTimeout(messageTimeout)
        messageTimeout = setTimeout(() => setShowScrollMessage(false), 1000)
      } else {
        leafletMap.dragging.enable() // Enable dragging
        setShowScrollMessage(false)
      }
    }

    const handleTouchEnd = () => {
      clearTimeout(messageTimeout)
      setShowScrollMessage(false) // Hide immediately on touch end to avoid showing after finishing a drag and releasing one finger before the other (it still shows until you release the second finger)
    }

    // Use capture phase for wheel to catch events before they propagate
    mapContainerRef.addEventListener('wheel', handleWheel, { passive: false })
    mapContainerRef.addEventListener('touchmove', handleTouchMove, { passive: true })
    mapContainerRef.addEventListener('touchend', handleTouchEnd, { passive: true })

    // Disable tracking when user drags the map
    leafletMap.on('drag', () => {
      if (autoTracking()) {
        setAutoTracking(false)
      }
      setShowScrollMessage(false)
    })

    // Center marker when user zooms the map
    leafletMap.on('zoom', () => {
      if (autoTracking()) {
        centerMarker()
      }
    })

    onCleanup(() => {
      observer.disconnect()
      if (routePath()) routePath()!.remove()
      if (marker()) marker()!.remove()
      mapContainerRef.removeEventListener('wheel', handleWheel, { capture: true })
      mapContainerRef.removeEventListener('touchmove', handleTouchMove)
      mapContainerRef.removeEventListener('touchend', handleTouchEnd)
      mapContainerRef.removeEventListener('mouseenter', handleMouseEnter)
      mapContainerRef.removeEventListener('mouseleave', handleMouseLeave)
      clearTimeout(messageTimeout)
      leafletMap.remove()
    })
  })

  // Draw route path when coordinates are loaded
  createEffect(() => {
    const gpsPoints = coords()
    const currentMap = map()
    const icon = markerIcon()

    if (!gpsPoints || !currentMap || !icon || gpsPoints.length === 0) return

    // Only create the path once when coordinates load
    if (!routePath()) {
      // Create path polyline
      const latLngs = gpsPoints.map((point) => [point.lat, point.lng] as Leaflet.LatLngExpression)
      // Visible line for display
      const visibleRouteLine = Leaflet.polyline(latLngs, {
        color: '#DFDFFE',
        weight: 5,
        opacity: 0.8,
      }).addTo(currentMap)
      // Wider, invisible line for touch
      const touchRouteLine = Leaflet.polyline(latLngs, {
        color: '#FF0000', // Red for debugging
        weight: 20, // Wider line for easier touch
        opacity: 0, // Completely transparent
      }).addTo(currentMap)

      // Add click event listener to the invisible line
      touchRouteLine.on('click', (e) => {
        const clickedLatLng = e.latlng
        const closestPoint = findClosestPointToLatLng(gpsPoints, clickedLatLng)
        if (closestPoint) {
          props.setCurrentTime(closestPoint.t)
        }
      })

      setRoutePath(visibleRouteLine)

      // Fit map to route bounds
      currentMap.fitBounds(visibleRouteLine.getBounds(), { padding: [20, 20] })

      // Create position marker at initial position
      const initialMarker = Leaflet.marker([gpsPoints[0].lat, gpsPoints[0].lng], { icon }).addTo(currentMap)
      setMarker(initialMarker)
    }
  })

  // Update marker position when current time changes
  createEffect(() => {
    const gpsPoints = coords()
    const currentMarker = marker()
    const currentMap = map()
    const currentTime = props.currentTime

    if (!gpsPoints?.length || !currentMarker || !currentMap) {
      return
    }

    // Find closest GPS point for current time
    const point = findClosestPointToTime(gpsPoints, currentTime)
    if (point) {
      const newLatLng = [point.lat, point.lng] as Leaflet.LatLngExpression
      currentMarker.setLatLng(newLatLng)
      // Center map on marker if tracking is enabled
      if (autoTracking()) {
        currentMap.panTo(newLatLng)
      }
    }
  })

  // Create marker icon once
  const createMarkerIcon = () => {
    const el = document.createElement('div')
    render(
      () => (
        <div class="flex size-[30px] items-center justify-center rounded-full bg-primary-container">
          <Icon name="directions_car" size="20" />
        </div>
      ),
      el,
    )

    return Leaflet.divIcon({
      className: 'border-none bg-none',
      html: el.innerHTML,
      iconSize: [20, 20],
      iconAnchor: [15, 15],
    })
  }

  // Toggle auto-tracking
  const toggleAutoTracking = () => {
    setAutoTracking(!autoTracking())
    if (autoTracking()) centerMarker()
  }

  // Center map on marker
  const centerMarker = () => {
    if (marker() && map()) {
      map()!.panTo(marker()!.getLatLng())
    }
  }

  // Get the instruction message based on device type
  const getScrollMessage = () => {
    if (isTouchDevice()) {
      return 'Use two fingers to pan and zoom'
    } else {
      return `Use ${isMacOS() ? '⌘ Cmd' : 'Ctrl'} + scroll to zoom`
    }
  }

  return (
    <div ref={mapContainerRef} class={clsx('relative h-full rounded-lg overflow-hidden', props.class)}>
      <div ref={mapRef} class="h-full w-full !bg-surface-container-low">
        {/* Scroll instruction overlay */}
        <Show when={showScrollMessage()}>
          {/* Dark overlay for the entire map - add animate-in fade-in */}
          <div class="absolute inset-0 z-[5400] bg-black bg-opacity-30 transition-opacity duration-200 animate-in fade-in"></div>
          {/* Message box */}
          <div class="absolute left-1/2 top-12 z-[5500] flex -translate-x-1/2 -translate-y-1/2 items-center rounded-xl bg-surface-container-high bg-opacity-90 backdrop-blur-sm px-6 py-3 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
            <Icon class="mr-3 text-primary" name={isTouchDevice() ? 'touch_app' : 'mouse'} size="24" />
            <span class="text-md font-medium">{getScrollMessage()}</span>
          </div>
        </Show>

        {/* Toggle auto tracking button */}
        <div class="absolute bottom-4 right-4 z-[5000]">
          <IconButton
            class={clsx('bg-surface-variant', autoTracking() && 'text-primary bg-surface-container-high')}
            name={autoTracking() ? 'my_location' : 'location_searching'}
            onClick={toggleAutoTracking}
            aria-label={autoTracking() ? 'Disable tracking' : 'Enable tracking'}
          ></IconButton>
        </div>

        <Show when={coords.loading}>
          <div class="absolute left-1/2 top-1/2 z-[5000] flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full bg-surface-variant px-4 py-2 shadow">
            <CircularProgress color="primary" size={24} class="mr-2" />
            <span class="text-sm">Loading map...</span>
          </div>
        </Show>

        <Show when={(coords.error as Error)?.message}>
          <div class="absolute left-1/2 top-1/2 z-[5000] flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full bg-surface-variant px-4 py-2 shadow">
            <Icon class="mr-2" name="error" size="20" />
            <span class="text-sm">{(coords.error as Error).message}</span>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default RoutePlaybackMap

// Helper function to find closest GPS point at a specific time
function findClosestPointToTime(points: GPSPathPoint[], time: number): GPSPathPoint | null {
  if (!points.length) return null

  let closestPoint = points[0]
  let minDiff = Math.abs(points[0].t - time)

  for (const point of points) {
    const t = point.t ?? 0
    const diff = Math.abs(t - time)
    if (diff < minDiff) {
      minDiff = diff
      closestPoint = point
      if (diff === 0) break // Break early if we find an exact match
    }

    // Break early if we've gone past the current time
    if (t > time) break
  }

  return closestPoint
}

// Helper function to find closest GPS point to a given lat/lng
function findClosestPointToLatLng(points: GPSPathPoint[], latLng: Leaflet.LatLng): GPSPathPoint | null {
  if (!points.length) return null

  let closestPoint = points[0]
  let minDistance = Leaflet.latLng(points[0].lat ?? 0, points[0].lng ?? 0).distanceTo(latLng)

  for (const point of points) {
    const pointLatLng = Leaflet.latLng(point.lat ?? 0, point.lng ?? 0)
    const distance = pointLatLng.distanceTo(latLng)
    if (distance < minDistance) {
      minDistance = distance
      closestPoint = point
      if (distance === 0) break // Break early if we find an exact match
    }
  }

  return closestPoint
}
