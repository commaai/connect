import { Accessor, Component, createEffect, createSignal, onMount, onCleanup } from 'solid-js'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getTileUrl } from '~/map'
import { GPSPathPoint } from '~/api/derived'
import IconButton from './material/IconButton'
import Icon from './material/Icon'
import { render } from 'solid-js/web'

const findClosestPoint = (lng: number, lat: number, coords: GPSPathPoint[]): number => {
  let minDist = Infinity
  let closestIndex = 0
  coords.forEach((point, i) => {
    const dist = Math.sqrt((point.lng - lng) ** 2 + (point.lat - lat) ** 2)
    if (dist < minDist) {
      minDist = dist
      closestIndex = i
    }
  })
  return closestIndex
}

const createCarIcon = () => {
  const el = document.createElement('div')
  render(
    () => (
      <div class="flex size-[40px] items-center justify-center rounded-full bg-primary-container">
        <Icon name="directions_car" />
      </div>
    ),
    el,
  )
  return L.divIcon({ className: 'car-icon', html: el.innerHTML, iconSize: [40, 40], iconAnchor: [20, 20] })
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
  let mapRef!: HTMLDivElement
  const [map, setMap] = createSignal<L.Map | null>(null)
  const [position, setPosition] = createSignal(0)
  const [isLocked, setIsLocked] = createSignal(true)
  const [isDragging, setIsDragging] = createSignal(false)
  const [isMapInteractive, setIsMapInteractive] = createSignal(false)

  const mapCoords = () => props.coords.map((p) => [p.lat, p.lng] as [number, number])
  const pastCoords = () => mapCoords().slice(0, position() + 1)
  const futureCoords = () => mapCoords().slice(position())
  const currentCoord = () => mapCoords()[position()]

  let marker: L.Marker | null = null
  let pastPolyline: L.Polyline | null = null
  let futurePolyline: L.Polyline | null = null
  let pastHitboxPolyline: L.Polyline | null = null
  let futureHitboxPolyline: L.Polyline | null = null

  onMount(() => {
    const m = L.map(mapRef, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
    })

    L.tileLayer(getTileUrl()).addTo(m)
    m.setView([props.coords[0].lat, props.coords[0].lng], props.coords.length ? 14 : 10)

    pastPolyline = L.polyline([], { color: props.color || '#6F707F', weight: props.strokeWidth || 4 }).addTo(m)
    futurePolyline = L.polyline([], { color: props.color || '#dfe0ff', weight: props.strokeWidth || 4 }).addTo(m)
    pastHitboxPolyline = L.polyline([], { color: 'transparent', weight: 20, opacity: 0 }).addTo(m)
    futureHitboxPolyline = L.polyline([], { color: 'transparent', weight: 20, opacity: 0 }).addTo(m)
    marker = L.marker([props.coords[0].lat, props.coords[0].lng], { icon: createCarIcon(), draggable: true }).addTo(m)

    const updatePosition = (lng: number, lat: number) => {
      const idx = findClosestPoint(lng, lat, props.coords)
      const point = mapCoords()[idx]
      marker?.setLatLng(point)
      setPosition(idx)
      props.updateTime(props.coords[idx].t)
    }

    const enableMap = () => {
      setIsMapInteractive(true)
      m.dragging.enable()
      m.touchZoom.enable()
      m.doubleClickZoom.enable()
      m.scrollWheelZoom.enable()
      m.boxZoom.enable()
    }

    const handleDrag = (e: L.LeafletMouseEvent | L.LeafletEvent) => {
      setIsLocked(false)
      if (!isMapInteractive()) enableMap()
      const { lng, lat } = 'latlng' in e ? e.latlng : e.target.getLatLng()
      updatePosition(lng, lat)
    }

    marker
      .on('dragstart', () => setIsDragging(true))
      .on('drag', handleDrag)
      .on('dragend', () => setIsDragging(false))

    m.on('mousemove', (e) => isDragging() && handleDrag(e)).on('mouseup', () => setIsDragging(false))
    ;[pastHitboxPolyline, futureHitboxPolyline].forEach((poly) => poly?.on('mousedown', handleDrag))

    setMap(m)
    onCleanup(() => m.remove())
  })

  createEffect(() => {
    const t = props.seekTime()
    if (!props.coords.length) return
    if (t < props.coords[0].t) {
      setPosition(0)
      return
    }
    const newPos = props.coords.findIndex((p, i) => i === props.coords.length - 1 || (t >= p.t && t < props.coords[i + 1].t))
    setPosition(newPos === -1 ? props.coords.length - 1 : newPos)
  })

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

    if (isLocked() && !isDragging()) map()?.setView(current, map()?.getZoom())
  })

  return (
    <div ref={mapRef} class="h-full relative" style={{ 'background-color': 'rgb(19 19 24)' }}>
      <IconButton
        name="my_location"
        class={`absolute z-[1000] left-4 top-4 bg-primary-container ${isLocked() && 'hidden'}`}
        onClick={() => {
          setIsLocked(true)
          map()?.setView(currentCoord(), map()?.getZoom())
          setIsMapInteractive(false) // Reset to non-interactable
          const m = map()
          if (m) {
            m.dragging.disable()
            m.touchZoom.disable()
            m.doubleClickZoom.disable()
            m.scrollWheelZoom.disable()
            m.boxZoom.disable()
          }
        }}
      />
    </div>
  )
}
