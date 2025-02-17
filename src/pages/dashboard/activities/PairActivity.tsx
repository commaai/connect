import { onCleanup, onMount, type JSX, type VoidComponent } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import { createMachine } from '@solid-primitives/state-machine'
import type { default as QrScannerType } from 'qr-scanner'

import { pairDevice } from '~/api/devices'
import Button from '~/components/material/Button'
import CircularProgress from '~/components/material/CircularProgress'
import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'

import './PairActivity.css'

const PairActivity: VoidComponent = () => {
  const { pair } = useLocation().query
  const pairToken: string | undefined = Array.isArray(pair) ? pair[0] : pair

  const state = createMachine<{
    scanning: {
      value: JSX.Element,
      to: 'pairing' | 'error'
    },
    pairing: {
      input: { pairToken: string },
      value: JSX.Element,
      to: 'error'
    },
    error: {
      input: { error: Error }
      value: JSX.Element,
      to: 'scanning'
    }
  }>({
    initial: pairToken ? {
      type: 'pairing',
      input: { pairToken },
    } : 'scanning',
    states: {
      scanning(_input, to) {
        let videoRef!: HTMLVideoElement
        let qrScanner: QrScannerType

        onMount(async () => {
          const { default: QrScanner } = await import('qr-scanner')
          await import('qr-scanner/qr-scanner-worker.min.js')

          qrScanner = new QrScanner(
            videoRef,
            (result) => {
              qrScanner.destroy()
              to.pairing({ pairToken: result.data })
            },
            {
              highlightScanRegion: true,
            },
          )
          void qrScanner.start()
        })

        onCleanup(() => {
          try {
            qrScanner?.destroy()
          } catch (_) { /* empty */ }
        })

        return (
          <div id="video-container" class="fixed inset-0 bg-black text-white">
            <video class="absolute inset-0 size-full object-cover" ref={videoRef} />
            <div class="prose absolute inset-0 flex flex-col justify-between pb-7">
              <TopAppBar trailing={<IconButton href="/">close</IconButton>}>
                Add new device
              </TopAppBar>
              <h2 class="px-8 text-center text-title-md">Use the viewfinder to scan the QR code on your device</h2>
            </div>
          </div>
        )
      },
      pairing(input, to) {
        const navigate = useNavigate()

        pairDevice(input.pairToken)
          .then((dongleId) => navigate(`/${dongleId}`))
          .catch((reason) => {
            let error: Error
            if (reason instanceof Error) {
              error = reason
            } else {
              error = new Error('An unknown error occurred', { cause: reason })
            }
            console.error('Error pairing device', error, error.cause)
            to.error({ error })
          })

        return (
          <>
            <TopAppBar>Add new device</TopAppBar>

            <div class="flex flex-col items-center gap-4">
              <CircularProgress class="m-4" color="primary" size={64} />

              Pairing your device...
            </div>
          </>
        )
      },
      error(input, to) {
        return (
          <>
            <TopAppBar trailing={<IconButton href="/">close</IconButton>}>
              Add new device
            </TopAppBar>

            <div class="flex flex-col items-center gap-4">
              An error occurred: {input.error.message}

              <Button color="primary" onClick={() => to.scanning()}>
                Retry
              </Button>
            </div>
          </>
        )
      },
    },
  })

  return <div>{state.value}</div>
}

export default PairActivity
