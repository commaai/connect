import { createEffect, createResource, onCleanup, onMount, type VoidComponent } from 'solid-js'
import clsx from 'clsx'
import Hls from 'hls.js/dist/hls.light.mjs'

import { getQCameraStreamUrl } from '~/api/route'

type RouteVideoPlayerProps = {
  class?: string
  routeName: string
  startTime: number
  onProgress?: (seekTime: number) => void
  ref?: (el: HTMLVideoElement) => void
}

const RouteVideoPlayer: VoidComponent<RouteVideoPlayerProps> = (props) => {
  const [streamUrl] = createResource(() => props.routeName, getQCameraStreamUrl)
  let video!: HTMLVideoElement

  onMount(() => {
    const timeUpdate = () => props.onProgress?.(video.currentTime)
    video.addEventListener('timeupdate', timeUpdate)
    onCleanup(() => video.removeEventListener('timeupdate', timeUpdate))
    video.currentTime = props.startTime
    props.ref?.(video)
  })

  createEffect(() => {
    if (!streamUrl()) return
    if (Hls.isSupported()) {
      const hls = new Hls()
      hls.loadSource(streamUrl()!)
      hls.attachMedia(video)
      onCleanup(() => hls.destroy())
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl()!
    } else {
      console.error('Browser does not support hls')
    }
  })

  return (
    <div
      class={clsx(
        'relative flex max-h-96 aspect-[241/151] items-center justify-center self-stretch overflow-hidden rounded-lg bg-surface-container-low',
        props.class,
      )}
    >
      <video ref={video} class="absolute inset-0 size-full object-cover" muted controls playsinline loop />
    </div>
  )
}

export default RouteVideoPlayer
