import { createMemo, createResource, ErrorBoundary, lazy, Match, Suspense, Switch } from 'solid-js'
import type { Component, JSXElement, VoidComponent } from 'solid-js'
import { Navigate, type RouteSectionProps, useLocation } from '@solidjs/router'
import clsx from 'clsx'

import { isSignedIn } from '~/api/auth/client'
import { USERADMIN_URL } from '~/api/config'
import { getDevices } from '~/api/devices'
import { getProfile } from '~/api/profile'
import storage from '~/utils/storage'
import type { Device } from '~/api/types'

import Button from '~/components/material/Button'
import ButtonBase from '~/components/material/ButtonBase'
import Drawer, { DrawerToggleButton, useDrawerContext } from '~/components/material/Drawer'
import Icon from '~/components/material/Icon'
import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'

import DeviceList from './components/DeviceList'
import DeviceActivity from './activities/DeviceActivity'
import RouteActivity from './activities/RouteActivity'
import SettingsActivity from './activities/SettingsActivity'
import BuildInfo from '~/components/BuildInfo'

const PairActivity = lazy(() => import('./activities/PairActivity'))

const DashboardDrawer: VoidComponent<{ devices: Device[] | undefined }> = (props) => {
  const { setOpen } = useDrawerContext()
  const onClose = () => setOpen(false)

  const [profile] = createResource(getProfile)

  return (
    <>
      <AppHeader />
      <DeviceList class="overflow-y-auto p-4" devices={props.devices} />
      <div class="grow" />
      <Button class="m-4" leading={<Icon name="add" />} href="/pair" onClick={onClose}>
        Add new device
      </Button>
      <div class="m-4 mt-0">
        <ButtonBase href={USERADMIN_URL}>
          <Suspense fallback={<div class="min-h-16 rounded-md skeleton-loader" />}>
            <div class="flex max-w-full items-center px-3 rounded-md outline outline-1 outline-outline-variant min-h-16">
              <div class="shrink-0 size-10 inline-flex items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                <Icon name="person" filled />
              </div>
              <div class="min-w-0 mx-3">
                <ErrorBoundary fallback="Error loading profile">
                  <div class="truncate text-sm text-on-surface">{profile()?.email}</div>
                  <div class="truncate text-xs text-on-surface-variant">{profile()?.user_id}</div>
                </ErrorBoundary>
              </div>
              <div class="grow" />
              <IconButton name="logout" href="/logout" />
            </div>
          </Suspense>
        </ButtonBase>
      </div>
    </>
  )
}

const AppHeader: VoidComponent<{ class?: string; leading?: JSXElement }> = (props) => {
  return (
    <TopAppBar
      component="h2"
      class={clsx('text-white p-4 bg-surface-container-highest border-b-2 border-b-outline-variant h-[4rem]', props.class)}
      leading={props.leading || <img src="/images/comma-white.svg" height="32" width="32" />}
    >
      connect
    </TopAppBar>
  )
}

const DashboardLayout: Component<{
  paneOne: JSXElement
  paneTwo: JSXElement
  paneTwoContent: boolean
}> = (props) => {
  return (
    <div class="relative size-full overflow-hidden">
      <AppHeader class="fixed top-0 inset-x-0 left-0 right-0" leading={<DrawerToggleButton />} />
      <div
        class={clsx(
          'mt-16 mx-auto size-full max-w-[1600px] md:grid md:grid-cols-2 lg:gap-2',
          // Flex layout for mobile with horizontal transition
          'flex transition-transform duration-300 ease-in-out',
          props.paneTwoContent ? '-translate-x-full md:translate-x-0' : 'translate-x-0',
        )}
      >
        <div class="pt-4 min-w-full overflow-y-scroll">{props.paneOne}</div>
        <div class="pt-4 min-w-full overflow-y-scroll">{props.paneTwo}</div>
      </div>
    </div>
  )
}

const FirstPairActivity: Component = () => {
  return (
    <>
      <AppHeader class="fixed top-0 inset-x-0 left-0 right-0" />
      <section class="flex flex-col gap-4 py-2 items-center mx-auto max-w-md px-4 mt-4 sm:mt-8 md:mt-16">
        <h2 class="text-xl">Pair your device</h2>
        <p class="text-lg">Scan the QR code on your device</p>
        <p class="text-md mt-4">If you cannot see a QR code, check the following:</p>
        <ul class="text-md list-disc list-inside">
          <li>Your device is connected to the internet</li>
          <li>You have installed the latest version of openpilot</li>
        </ul>
        <p class="text-md">
          If you still cannot see a QR code, your device may already be paired to another account. Make sure you have signed in to connect
          with the same account you may have used previously.
        </p>
        <Button class="mt-4" leading={<Icon name="add" />} href="/pair">
          Add new device
        </Button>
      </section>
    </>
  )
}

const Dashboard: Component<RouteSectionProps> = () => {
  const location = useLocation()
  const urlState = createMemo(() => {
    const parts = location.pathname.split('/').slice(1).filter(Boolean)
    const startTime = parts[2] ? Math.max(Number(parts[2]), 0) : 0
    const endTime = parts[3] ? Math.max(Number(parts[3]), startTime + 1) : undefined
    return {
      dongleId: parts[0] as string | undefined,
      dateStr: parts[1] as string | undefined,
      startTime,
      endTime,
    }
  })

  const [devices, { refetch }] = createResource(getDevices, { initialValue: undefined })

  const getDefaultDongleId = () => {
    // Do not redirect if dongle ID already selected
    if (urlState().dongleId) return undefined

    const lastSelectedDongleId = storage.getItem('lastSelectedDongleId')
    if (devices()?.some((device) => device.dongle_id === lastSelectedDongleId)) return lastSelectedDongleId
    return devices()?.[0]?.dongle_id
  }

  return (
    <Drawer drawer={<DashboardDrawer devices={devices()} />}>
      <Switch>
        <Match when={!isSignedIn()}>
          <Navigate href="/login" />
        </Match>
        <Match when={urlState().dongleId === 'pair' || !!location.query.pair}>
          <PairActivity onPaired={refetch} />
        </Match>
        <Match when={urlState().dongleId} keyed>
          {(dongleId) => (
            <DashboardLayout
              paneOne={<DeviceActivity dongleId={dongleId} />}
              paneTwo={
                <Switch
                  fallback={
                    <div class="hidden size-full flex-col items-center justify-center gap-4 md:flex">
                      <Icon name="search" size="48" />
                      <span class="text-md">Select a route to view</span>
                      <BuildInfo class="absolute bottom-4" />
                    </div>
                  }
                >
                  <Match when={urlState().dateStr === 'settings' || urlState().dateStr === 'prime'}>
                    <SettingsActivity dongleId={dongleId} />
                  </Match>
                  <Match when={urlState().dateStr} keyed>
                    {(dateStr) => (
                      <RouteActivity dongleId={dongleId} dateStr={dateStr} startTime={urlState().startTime} endTime={urlState().endTime} />
                    )}
                  </Match>
                </Switch>
              }
              paneTwoContent={!!urlState().dateStr}
            />
          )}
        </Match>
        <Match when={getDefaultDongleId()} keyed>
          {(defaultDongleId) => <Navigate href={`/${defaultDongleId}`} />}
        </Match>
        <Match when={devices()?.length === 0}>
          <FirstPairActivity />
        </Match>
      </Switch>
    </Drawer>
  )
}

export default Dashboard
