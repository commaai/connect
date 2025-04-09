import { createMemo, createResource, lazy, Match, Show, Switch } from 'solid-js'
import type { Component, JSXElement, VoidComponent } from 'solid-js'
import { Navigate, type RouteSectionProps, useLocation, useNavigate } from '@solidjs/router'
import clsx from 'clsx'

import { isSignedIn } from '~/api/auth/client'
import { getDevices } from '~/api/devices'
import storage from '~/utils/storage'
import type { Device } from '~/api/types'

import Button from '~/components/material/Button'
import Drawer, { useDrawerContext } from '~/components/material/Drawer'
import Icon from '~/components/material/Icon'

import DeviceList from './components/DeviceList'
import DeviceActivity from './activities/DeviceActivity'
import RouteActivity from './activities/RouteActivity'
import SettingsActivity from './activities/SettingsActivity'
import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'
import { USERADMIN_URL } from '~/api/config'

const PairActivity = lazy(() => import('./activities/PairActivity'))

const AppHeader: VoidComponent = () => {
  const navigate = useNavigate()
  const { modal, open, setOpen } = useDrawerContext()
  const goHome = () => {
    setOpen(false)
    navigate('/')
  }

  return (
    <TopAppBar
      class="fixed top-0 inset-x-0"
      leading={
        <Show
          when={modal()}
          fallback={<img onClick={goHome} class="cursor-pointer" alt="comma logo" src="/images/comma-white.svg" height="32" width="32" />}
        >
          <IconButton name={open() ? 'close' : 'menu'} onClick={() => setOpen((prev) => !prev)} />
        </Show>
      }
      trailing={
        <div class="flex items-center gap-3">
          <IconButton href={USERADMIN_URL} name="person" filled target="_blank" title="Useradmin" />
          <IconButton href="/logout" name="logout" title="Sign out" />
        </div>
      }
    >
      <span class="cursor-pointer font-bold" onClick={goHome}>
        connect
      </span>
    </TopAppBar>
  )
}

const DashboardDrawer: VoidComponent<{ devices: Device[] }> = (props) => {
  const { setOpen } = useDrawerContext()
  const onClose = () => setOpen(false)
  return (
    <>
      <DeviceList class="overflow-y-auto px-2" devices={props.devices} />
      <div class="grow" />
      <Button class="m-4" leading={<Icon name="add" />} href="/pair" onClick={onClose}>
        Add new device
      </Button>
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
      <AppHeader />
      <div
        class={clsx(
          'mx-auto size-full max-w-[1600px] md:grid md:grid-cols-2 lg:gap-2',
          // Flex layout for mobile with horizontal transition
          'flex transition-transform duration-300 ease-in-out',
          props.paneTwoContent ? '-translate-x-full md:translate-x-0' : 'translate-x-0',
        )}
      >
        <div class="min-w-full overflow-y-scroll">{props.paneOne}</div>
        <div class="min-w-full overflow-y-scroll">{props.paneTwo}</div>
      </div>
    </div>
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

  const [devices, { refetch }] = createResource(getDevices, { initialValue: [] })

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
                      <span class="text-title-md">Select a route to view</span>
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
      </Switch>
    </Drawer>
  )
}

export default Dashboard
