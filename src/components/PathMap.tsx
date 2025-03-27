import { Accessor, Component, createEffect, createSignal, onMount, onCleanup } from 'solid-js'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getTileUrl } from '~/map' // Assuming this provides a tile URL compatible with Leaflet
import { GPSPathPoint } from '~/api/derived'

// Utility to find the closest GPS point to a clicked location
function findClosestPoint(lng: number, lat: number, coords: GPSPathPoint[]): number {
  let minDist = Infinity
  let closestIndex = 0

  coords.forEach((point, index) => {
    const dist = Math.sqrt((point.lng - lng) ** 2 + (point.lat - lat) ** 2)
    if (dist < minDist) {
      minDist = dist
      closestIndex = index
    }
  })

  return closestIndex
}

export const PathMap: Component<{
  themeId: string
  duration: Accessor<number>
  seekTime: Accessor<number>
  updateTime: (newTime: number) => void
  coords: GPSPathPoint[]
  hidpi: boolean
  strokeWidth?: number
  color?: string
  opacity?: number
}> = (props) => {
  // Reference for the map container
  let mapRef!: HTMLDivElement

  // Signals for the map instance and current position
  const [map, setMap] = createSignal<L.Map | null>(null)
  const [position, setPosition] = createSignal(0)

  // Coordinate transformation functions (Leaflet uses [lat, lng] order)
  const mapCoords = () => props.coords.map((point) => [point.lat, point.lng] as [number, number])
  const pastCoords = () => mapCoords().slice(0, position() + 1)
  const futureCoords = () => mapCoords().slice(position())
  const currentCoord = () => mapCoords()[position()]

  // Leaflet layer variables
  let pastPolyline: L.Polyline | null = null
  let futurePolyline: L.Polyline | null = null
  let pastHitboxPolyline: L.Polyline | null = null
  let futureHitboxPolyline: L.Polyline | null = null
  let marker: L.CircleMarker | null = null

  // Initialize the Leaflet map on mount
  onMount(() => {
    const m = L.map(mapRef, { zoomControl: false })
    L.tileLayer(getTileUrl()).addTo(m)

    // Set initial view to the first coordinate or a default if coords are empty
    if (props.coords.length > 0) {
      m.setView(mapCoords()[0], 14)
    } else {
      m.setView([32.711483, -117.161052], 10) // Default to San Diego
    }

    // Create polylines and marker with initial empty coordinates
    pastPolyline = L.polyline([], {
      color: props.color || '#6F707F',
      weight: props.strokeWidth || 4,
    }).addTo(m)

    futurePolyline = L.polyline([], {
      color: props.color || '#dfe0ff',
      weight: props.strokeWidth || 4,
    }).addTo(m)

    pastHitboxPolyline = L.polyline([], {
      color: 'transparent',
      weight: 20,
      opacity: 0,
    }).addTo(m)

    futureHitboxPolyline = L.polyline([], {
      color: 'transparent',
      weight: 20,
      opacity: 0,
    }).addTo(m)

    marker = L.circleMarker([0, 0], {
      radius: 6,
      fillOpacity: 1,
      color: '#7578CC',
    }).addTo(m)

    // Click handler for the hitbox polylines
    const handleLineClick = (e: L.LeafletMouseEvent) => {
      const { lng, lat } = e.latlng
      const newPos = findClosestPoint(lng, lat, props.coords)
      setPosition(newPos)
      props.updateTime(props.coords[newPos].t)
    }

    pastHitboxPolyline.on('click', handleLineClick)
    futureHitboxPolyline.on('click', handleLineClick)

    setMap(m)

    // Cleanup the map on unmount
    onCleanup(() => {
      m.remove()
    })
  })

  // Effect to update position based on seekTime
  createEffect(() => {
    const currentTime = props.seekTime()
    if (!props.coords.length) return

    let newPos = 0
    for (let i = 0; i < props.coords.length - 1; i++) {
      if (currentTime >= props.coords[i].t && currentTime < props.coords[i + 1].t) {
        newPos = i
        break
      }
    }
    if (currentTime >= props.coords[props.coords.length - 1].t) {
      newPos = props.coords.length - 1
    }
    setPosition(newPos)
  })

  // Effect to update map layers and view based on position
  createEffect(() => {
    if (!map() || !props.coords.length) return

    const past = pastCoords()
    const future = futureCoords()
    const current = currentCoord()

    pastPolyline?.setLatLngs(past)
    futurePolyline?.setLatLngs(future)
    pastHitboxPolyline?.setLatLngs(past)
    futureHitboxPolyline?.setLatLngs(future)
    marker?.setLatLng(current)
    map()?.setView(current, map()?.getZoom())
  })

  return <div ref={mapRef} class="h-full" />
}
