import { createEffect, createMemo, createResource, lazy, Match, Show, Suspense, Switch } from 'solid-js'
import type { Component, JSXElement, VoidComponent } from 'solid-js'
import { Navigate, type RouteSectionProps, useLocation } from '@solidjs/router'
import clsx from 'clsx'

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
import { useAppContext } from '~/AppContext'

const PairActivity = lazy(() => import('./activities/PairActivity'))

const DashboardDrawer: VoidComponent<{ devices: Device[] }> = (props) => {
  const { modal, setOpen } = useDrawerContext()
  const onClose = () => setOpen(false)

  const [profile] = createResource(getProfile)

  return (
    <>
      <TopAppBar
        component="h1"
        leading={
          <Show when={modal()}>
            <IconButton name="arrow_back" onClick={onClose} />
          </Show>
        }
      >
        Devices
      </TopAppBar>
      <DeviceList class="overflow-y-auto p-2" devices={props.devices} />
      <div class="grow" />
      <Button class="m-4" leading={<Icon name="add" />} href="/pair" onClick={onClose}>
        Add new device
      </Button>
      <div class="m-4 mt-0">
        <ButtonBase href={USERADMIN_URL}>
          <Suspense fallback={<div class="min-h-16 rounded-md skeleton-loader" />}>
            <div class="flex max-w-full items-center px-3 rounded-md outline outline-1 outline-outline-variant min-h-16">
              <div class="shrink-0 size-10 inline-flex items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                <Icon name={!profile.loading && !profile.latest ? 'person_off' : 'person'} filled />
              </div>
              <Show
                when={profile()}
                fallback={
                  <>
                    <div class="mx-3">Not signed in</div>
                    <div class="grow" />
                    <IconButton name="login" href="/login" />
                  </>
                }
              >
                <div class="min-w-0 mx-3">
                  <div class="truncate text-body-md text-on-surface">{profile()?.email}</div>
                  <div class="truncate text-label-sm text-on-surface-variant">{profile()?.user_id}</div>
                </div>
                <div class="grow" />
                <IconButton name="logout" href="/logout" />
              </Show>
            </div>
          </Suspense>
        </ButtonBase>
      </div>
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
    return {
      dongleId: parts[0] as string | undefined,
      dateStr: parts[1] as string | undefined,
      startTime: parts[2] ? Number(parts[2]) : 0,
    }
  })

  const [state, { setCurrentProfile, setCurrentDevice }] = useAppContext()

  const [devices] = createResource(getDevices, { initialValue: [] })
  const [profile] = createResource(getProfile)

  createEffect(() => {
    if (profile.latest) setCurrentProfile(profile.latest)
    if (devices.latest && urlState().dongleId) setCurrentDevice(devices.latest.find((device) => device.dongle_id === urlState().dongleId)!)
  })

  const getDefaultDongleId = () => {
    // Do not redirect if dongle ID already selected
    if (urlState().dongleId) return undefined

    const lastSelectedDongleId = storage.getItem('lastSelectedDongleId')
    if (devices()?.some((device) => device.dongle_id === lastSelectedDongleId)) return lastSelectedDongleId
    return devices()?.[0]?.dongle_id
  }

  return (
    <Drawer drawer={<DashboardDrawer devices={devices()} />}>
      <Switch fallback={<TopAppBar leading={<DrawerToggleButton />}>No device</TopAppBar>}>
        <Match when={urlState().dongleId === 'pair' || !!location.query.pair}>
          <PairActivity />
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
                  <Match when={state.currentRoute || urlState().dateStr}>
                    <RouteActivity
                      dongleId={dongleId}
                      dateStr={urlState().dateStr ?? state.currentRoute!.fullname.split('|')[1]}
                      startTime={urlState().startTime}
                    />
                  </Match>
                </Switch>
              }
              paneTwoContent={!!urlState().dateStr}
            />
          )}
        </Match>
        <Match when={!profile.loading && !profile.latest}>
          <Navigate href="/login" />
        </Match>
        <Match when={getDefaultDongleId()} keyed>
          {(defaultDongleId) => <Navigate href={`/${defaultDongleId}`} />}
        </Match>
      </Switch>
    </Drawer>
  )
}

export default Dashboard
