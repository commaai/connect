import { createResource, lazy, Match, Show, SuspenseList, Switch } from 'solid-js'
import { Suspense } from 'solid-js'
import type { Component, JSXElement, VoidComponent } from 'solid-js'
import { Navigate, type RouteSectionProps, useLocation } from '@solidjs/router'
import clsx from 'clsx'

import { getDevices } from '~/api/devices'
import { getProfile } from '~/api/profile'
import type { Device } from '~/types'
import storage from '~/utils/storage'

import Button from '~/components/material/Button'
import Drawer, { DrawerToggleButton, useDrawerContext } from '~/components/material/Drawer'
import Icon from '~/components/material/Icon'
import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'

import DeviceList from './components/DeviceList'
import DeviceActivity from './activities/DeviceActivity'
import SettingsActivity from './activities/SettingsActivity'

const PairActivity = lazy(() => import('./activities/PairActivity'))
const RouteActivityLazy = lazy(() => import('./activities/RouteActivity'))

interface DashboardDrawerProps {
  devices?: Device[]
}

const DashboardDrawer: VoidComponent<DashboardDrawerProps> = (props) => {
  const { modal, setOpen } = useDrawerContext()
  const onClose = () => setOpen(false)
  return (
    <>
      <TopAppBar
        component="h1"
        leading={<Show when={modal()}><IconButton onClick={onClose}>arrow_back</IconButton></Show>}
      >
        comma connect
      </TopAppBar>
      <h2 class="mx-4 mb-2 text-label-sm uppercase">
        Devices
      </h2>
      <Show when={props.devices} keyed>
        {devices => <DeviceList class="overflow-y-auto p-2" devices={devices} />}
      </Show>
      <div class="grow" />
      <Button class="m-4" leading={<Icon>add</Icon>} href="/pair" onClick={onClose}>
        Add new device
      </Button>
      <hr class="mx-4 opacity-20" />
      <Button class="m-4" color="error" href="/logout">Sign out</Button>
    </>
  )
}

const DashboardLayout: Component<{
  paneOne: JSXElement
  paneTwo: JSXElement
  paneTwoContent: boolean
}> = (props) => {
  return (
    <div class="relative size-full overflow-hidden">
      <div
        class={clsx(
          'mx-auto size-full max-w-[1560px] md:grid md:grid-cols-2 lg:gap-2',
          // Flex layout for mobile with horizontal transition
          'flex transition-transform duration-300 ease-in-out',
          props.paneTwoContent ? '-translate-x-full md:translate-x-0' : 'translate-x-0',
        )}
      >
        <SuspenseList revealOrder="forwards">
          <div class="min-w-full overflow-y-scroll">{props.paneOne}</div>
          <div class="min-w-full overflow-y-scroll">{props.paneTwo}</div>
        </SuspenseList>
      </div>
    </div>
  )
}

const Dashboard: Component<RouteSectionProps> = () => {
  const location = useLocation()

  const pathParts = () => location.pathname.split('/').slice(1).filter(Boolean)
  const dongleId = () => pathParts()[0]
  const dateStr = () => pathParts()[1]

  const pairToken = () => !!location.query.pair

  const [devices] = createResource(getDevices)
  const [profile] = createResource(getProfile)

  const getDefaultDongleId = () => {
    // Do not redirect if dongle ID already selected
    if (dongleId()) return undefined

    const lastSelectedDongleId = storage.getItem('lastSelectedDongleId')
    if (devices()?.some((device) => device.dongle_id === lastSelectedDongleId)) return lastSelectedDongleId
    return devices()?.[0]?.dongle_id
  }

  return (
    <Drawer drawer={<DashboardDrawer devices={devices()} />}>
      <Switch fallback={<TopAppBar leading={<DrawerToggleButton />}>No device</TopAppBar>}>
        <Match when={!!profile.error}>
          <Navigate href="/login" />
        </Match>
        <Match when={dongleId() === 'pair' || pairToken()}>
          <PairActivity />
        </Match>
        <Match when={dongleId()} keyed>{(id) => (
          <DashboardLayout
            paneOne={<DeviceActivity dongleId={id} />}
            paneTwo={<Switch
              fallback={<div class="hidden size-full flex-col items-center justify-center gap-4 md:flex">
                <Icon size="48">search</Icon>
                <span class="text-title-md">Select a route to view</span>
              </div>}
            >
              <Match when={dateStr() === 'settings' || dateStr() === 'prime'}>
                <SettingsActivity dongleId={id} />
              </Match>
              <Match when={dateStr()} keyed>
                {(date) => (
                  <Suspense
                    fallback={
                      <div class="flex h-full items-center justify-center">
                        <div class="aspect-square w-12 animate-spin rounded-full border-8 border-surface-variant border-t-primary" />
                      </div>
                    }
                  >
                    <RouteActivityLazy dongleId={id} dateStr={date} />
                  </Suspense>
                )}
              </Match>
            </Switch>}
            paneTwoContent={!!dateStr()}
          />
        )}</Match>
        <Match when={getDefaultDongleId()} keyed>
          {(defaultDongleId) => <Navigate href={`/${defaultDongleId}`} />}
        </Match>
      </Switch>
    </Drawer>
  )
}

export default Dashboard
