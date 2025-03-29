import { createEffect, createResource, createSignal, onCleanup, onMount, type VoidComponent } from 'solid-js'
import clsx from 'clsx'

import { getQCameraStreamUrl } from '~/api/route'
import Icon from '~/components/material/Icon'
import { formatVideoTime } from '~/utils/format'
import type Hls from '~/utils/hls'

type RouteVideoPlayerProps = {
  class?: string
  routeName: string
  onProgress?: (time: number) => void
  ref?: (el: HTMLVideoElement) => void
}

const RouteVideoPlayer: VoidComponent<RouteVideoPlayerProps> = (props) => {
  const [streamUrl] = createResource(() => props.routeName, getQCameraStreamUrl)
  const [isPlaying, setIsPlaying] = createSignal(true)
  const [progress, setProgress] = createSignal(0)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  let video!: HTMLVideoElement

  createEffect(() => {
    if (!streamUrl()) return

    if (!('MediaSource' in window)) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl()!
        return
      }
      console.error('Browser does not support Media Source Extensions API')
      return
    }

    let player: Hls
    void import('~/utils/hls').then(({ createHls }) => {
      player = createHls()
      player.loadSource(streamUrl()!)
      player.attachMedia(video)
    })
    onCleanup(() => player?.destroy())
  })

  function updateProgressOnTimeUpdate() {
    if (!video.paused) return
    const currentProgress = (video.currentTime / video.duration) * 100
    setProgress(currentProgress)
    props.onProgress?.(video.currentTime)
  }

  function updateProgressContinuously() {
    if (!video || video.paused) return
    const currentProgress = (video.currentTime / video.duration) * 100
    setProgress(currentProgress)
    props.onProgress?.(video.currentTime)
    requestAnimationFrame(updateProgressContinuously)
  }

  function startProgressTracking() {
    requestAnimationFrame(updateProgressContinuously)
  }

  function togglePlayback() {
    if (video.paused) {
      void video.play()
    } else {
      video.pause()
    }
  }

  onMount(() => {
    const handleTimeUpdate = () => props.onProgress?.(video.currentTime)
    video.addEventListener('timeupdate', handleTimeUpdate)

    video.addEventListener('play', () => setIsPlaying(true))
    video.addEventListener('pause', () => setIsPlaying(false))
    video.addEventListener('ended', () => setIsPlaying(false))

    video.addEventListener('stalled', () => {
      if (isPlaying()) {
        void video.play()
      }
    })

    video.addEventListener('loadedmetadata', () => {
      setDuration(video.duration)
      if ('ontouchstart' in window) return
      void video.play().catch(() => {})
    })

    onCleanup(() => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', () => setIsPlaying(true))
      video.removeEventListener('pause', () => setIsPlaying(false))
      video.removeEventListener('ended', () => setIsPlaying(false))
      video.removeEventListener('stalled', () => {})
    })

    props.ref?.(video)
  })

  return (
    <div
      class={clsx(
        'relative flex aspect-[241/151] items-center justify-center self-stretch overflow-hidden rounded-t-md bg-surface-container-low isolate',
        props.class,
      )}
    >
      {/* Video as background */}
      <div class="absolute inset-0 -z-10">
        <video
          ref={(el) => {
            video = el
            props.ref?.(el)
          }}
          class="size-full object-cover"
          data-testid="route-video"
          autoplay
          muted
          playsinline
          controls={false}
          disablepictureinpicture
          onPlay={startProgressTracking}
          onTimeUpdate={(e) => {
            updateProgressOnTimeUpdate()
            setCurrentTime(e.currentTarget.currentTime)
          }}
          loop
        />
      </div>

      {/* Controls overlay */}
      <div class="absolute inset-0 flex items-end">
        {/* Controls background gradient */}
        <div class="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />

        {/* Controls container */}
        <div class="relative flex w-full items-center gap-4 pb-4 pl-1">
          <button
            class="bg-surface-container-highest/80 flex size-8 items-center justify-center rounded-full text-on-surface hover:bg-surface-container-highest"
            onClick={togglePlayback}
          >
            <Icon name={isPlaying() ? 'pause' : 'play_arrow'} />
          </button>

          <div class="font-mono text-sm text-on-surface">
            {formatVideoTime(currentTime())} / {formatVideoTime(duration())}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div class="absolute inset-x-0 bottom-0 h-1 bg-surface-container-high">
        <div class="h-full bg-yellow-400" style={{ width: `${progress()}%` }} />
      </div>
    </div>
  )
}

export default RouteVideoPlayer
