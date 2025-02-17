import { createEffect, createResource, onCleanup, onMount, type VoidComponent, createSignal } from 'solid-js'
import { formatVideoTime } from '~/utils/format'
import Icon from '~/components/material/Icon'
import clsx from 'clsx'

import { getQCameraStreamUrl } from '~/api/route'

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

  function setupVideoSource() {
    if (!streamUrl()) return

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl()!
      return
    }

    if (window.MediaSource !== undefined) {
      void import('~/hls/custom-hls')
        .then(({ createHls }) => {
          const player = createHls()
          player.loadSource(streamUrl()!)
          player.attachMedia(video)
          onCleanup(() => player.destroy())
        })
        .catch(error => {
          console.error('Failed to load HLS.js:', error)
        })
    }
  }

  function updateProgressOnTimeUpdate() {
    if (video.paused) {
      const currentProgress = (video.currentTime / video.duration) * 100
      setProgress(currentProgress)
      props.onProgress?.(video.currentTime)
    }
  }

  function updateProgressContinuously() {
    if (video && !video.paused) {
      const currentProgress = (video.currentTime / video.duration) * 100
      setProgress(currentProgress)
      props.onProgress?.(video.currentTime)
      requestAnimationFrame(updateProgressContinuously)
    }
  }

  function startProgressTracking() {
    requestAnimationFrame(updateProgressContinuously)
  }

  function togglePlayback() {
    if (video.paused) {
      void video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  function setupVideoEventListeners() {
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
      if (!('ontouchstart' in window)) {
        void video.play().catch(() => {})
      }
    })
    
    onCleanup(() => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', () => setIsPlaying(true))
      video.removeEventListener('pause', () => setIsPlaying(false))
      video.removeEventListener('ended', () => setIsPlaying(false))
      video.removeEventListener('stalled', () => {})
    })
    
    props.ref?.(video)
  }

  onMount(setupVideoEventListeners)
  createEffect(setupVideoSource)

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
            <Icon>{isPlaying() ? 'pause' : 'play_arrow'}</Icon>
          </button>

          <div class="font-mono text-sm text-on-surface">
            {formatVideoTime(currentTime())} / {formatVideoTime(duration())}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div class="absolute inset-x-0 bottom-0 h-2 bg-surface-container-high">
        <div 
          class="h-full bg-yellow-400 transition-[width]" 
          style={{ width: `${progress()}%` }}
        />
      </div>
    </div>
  )
}

export default RouteVideoPlayer
