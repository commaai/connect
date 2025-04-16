import { Show, createEffect, createResource, createSignal, on, onCleanup, onMount, type VoidComponent } from 'solid-js'
import clsx from 'clsx'

import { getQCameraStreamUrl } from '~/api/route'
import IconButton from '~/components/material/IconButton'
import { formatVideoTime } from '~/utils/format'
import type Hls from '~/utils/hls'

type RouteVideoPlayerProps = {
  class?: string
  routeName: string
  selection: { startTime: number; endTime: number | undefined }
  onProgress: (seekTime: number) => void
  ref: (el?: HTMLVideoElement) => void
}

const ERROR_MISSING_SEGMENT = 'This video segment has not uploaded yet or has been deleted.'
const ERROR_UNSUPPORTED_BROWSER = 'This browser does not support Media Source Extensions API.'

const RouteVideoPlayer: VoidComponent<RouteVideoPlayerProps> = (props) => {
  const routeName = () => props.routeName
  const [streamUrl] = createResource(routeName, getQCameraStreamUrl)
  const [hls, setHls] = createSignal<Hls | null>()
  let video!: HTMLVideoElement
  let controls!: HTMLDivElement

  const [isPlaying, setIsPlaying] = createSignal(true)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [videoLoading, setVideoLoading] = createSignal(true)
  const [errorMessage, setErrorMessage] = createSignal<string>('')

  const onLoadedData = () => {
    setVideoLoading(false)
    setErrorMessage('')
  }
  const onError = () => {
    setErrorMessage(ERROR_MISSING_SEGMENT)
    setVideoLoading(false)
  }
  const updateProgress = () => props.onProgress?.(video.currentTime)
  const updateProgressContinuously = () => {
    if (!video || video.paused) return
    updateProgress()
    requestAnimationFrame(updateProgressContinuously)
  }
  const startProgressTracking = () => {
    requestAnimationFrame(updateProgressContinuously)
  }

  const togglePlayback = () => {
    if (video.paused) {
      void video.play()
    } else {
      video.pause()
    }
  }
  const onClick = (e: Event) => {
    e.preventDefault()
    togglePlayback()
  }

  const onTimeUpdate = (e: Event) => {
    setCurrentTime((e.currentTarget as HTMLVideoElement).currentTime)

    // If there is a selection, loop within it
    if (currentTime() < props.selection.startTime) {
      video.currentTime = props.selection.startTime
    } else if (props.selection.endTime !== undefined) {
      if (currentTime() > props.selection.endTime) {
        video.currentTime = props.selection.startTime
      }
    }

    if (video.paused) updateProgress()
  }
  const onLoadedMetadata = () => setDuration(Math.ceil(video.duration))
  const onPlay = () => {
    setIsPlaying(true)
    startProgressTracking()
  }
  const onPause = () => setIsPlaying(false)
  const onEnded = () => setIsPlaying(false)
  const onStalled = () => {
    if (!isPlaying()) return
    void video.play()
  }

  onMount(() => {
    if (props.selection.startTime > 0) {
      video.currentTime = props.selection.startTime
    }

    props.ref?.(video)

    controls.addEventListener('click', onClick)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('loadeddata', onLoadedData)
    video.addEventListener('error', onError)

    onCleanup(() => {
      controls.removeEventListener('click', onClick)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('error', onError)
      props.ref?.(video)
    })

    if ('MediaSource' in window) {
      import('~/utils/hls').then((Hls) => {
        const player = Hls.createHls()
        player.attachMedia(video)
        setHls(player)

        // Hls error handler
        const { Events, ErrorTypes } = Hls.default
        player.on(Events.ERROR, (_, data) => {
          if (data.fatal && data.type === ErrorTypes.NETWORK_ERROR) onError()
        })
      })
      onCleanup(() => hls()?.destroy())
    } else {
      setHls(null)
      if (!video.canPlayType('application/vnd.apple.mpegurl')) {
        console.error('Browser does not support Media Source Extensions API')
        setErrorMessage(ERROR_UNSUPPORTED_BROWSER)
      }
    }
  })

  // State reset on route change
  createEffect(
    on(routeName, () => {
      setVideoLoading(true)
      setErrorMessage('')
    }),
  )

  createEffect(() => {
    const url = streamUrl()
    const player = hls()
    if (!url || player === undefined) return

    if (player) {
      player.loadSource(url)
    } else {
      video.src = url
    }
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
          ref={video}
          class="size-full object-cover"
          data-testid="route-video"
          autoplay
          muted
          controls={false}
          playsinline
          disablepictureinpicture
        />
      </div>

      {/* Loading animation */}
      <Show when={videoLoading()}>
        <div class="absolute inset-0 z-0 skeleton-loader" />
      </Show>

      {/* Error message */}
      <Show when={errorMessage()}>
        <div class="absolute inset-0 z-0 flex flex-col items-center justify-center gap-1">
          <IconButton name="error" />
          <span class="w-[90%] text-center text-wrap">{errorMessage()}</span>
        </div>
      </Show>

      {/* Controls overlay */}
      <div class="absolute inset-0 flex items-end" ref={controls}>
        {/* Controls background gradient */}
        <div class="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />

        {/* Controls container */}
        <div class="relative flex w-full items-center gap-3 pb-3 px-2">
          <IconButton name={isPlaying() ? 'pause' : 'play_arrow'} filled />

          <div class="font-mono text-sm text-on-surface">
            {formatVideoTime(currentTime())} / {formatVideoTime(duration())}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RouteVideoPlayer
