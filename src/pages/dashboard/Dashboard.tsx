import { createResource, lazy, Match, ParentComponent, Show, Suspense, SuspenseList, Switch } from 'solid-js'
import type { Component, JSXElement, VoidComponent } from 'solid-js'
import { Navigate, type RouteSectionProps, useLocation } from '@solidjs/router'
import clsx from 'clsx'

import { getDevices } from '~/api/devices'
import { getProfile } from '~/api/profile'
import storage from '~/utils/storage'

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

const PairActivity = lazy(() => import('./activities/PairActivity'))

const DashboardDrawer: VoidComponent = () => {
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
        comma connect
      </TopAppBar>
      <h2 class="mx-4 mb-2 text-label-sm uppercase">Devices</h2>
      <DeviceList class="overflow-y-auto p-2" />
      <div class="grow" />
      <Button class="m-4" leading={<Icon name="add" />} href="/pair" onClick={onClose}>
        Add new device
      </Button>
      <div class="m-4 mt-0">
        <ButtonBase href="https://useradmin.comma.ai">
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

const SinglePaneLayout: ParentComponent = (props) => (
  <div class="relative size-full overflow-hidden">
    <div class="flex flex-col mx-auto size-full max-w-[800px]">
      <TopAppBar class="xl:hidden" leading={<DrawerToggleButton />}></TopAppBar>
      <div class="min-w-full overflow-y-scroll">{props.children}</div>
    </div>
  </div>
)

const TwoPaneLayout: Component<{
  paneOne: JSXElement
  paneTwo: JSXElement
  paneTwoContent: boolean
}> = (props) => (
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

const Dashboard: Component<RouteSectionProps> = () => {
  const location = useLocation()

  const pathParts = () => location.pathname.split('/').slice(1).filter(Boolean)
  const dongleId = () => pathParts()[0]
  const dateStr = () => pathParts()[1]
  const startTime = () => (pathParts()[2] ? Number(pathParts()[2]) : 0)

  const pairToken = () => !!location.query.pair

  const [devices] = createResource(getDevices)
  const [profile] = createResource(getProfile)
  const [isSharedDevice] = createResource(
    () => ({ devices: devices(), dongleId: dongleId(), profile: profile() }),
    ({ devices, dongleId, profile }) =>
      !profile?.superuser && devices && dongleId && !devices.find((device) => device.dongle_id === dongleId),
  )

  const getDefaultDongleId = () => {
    // Do not redirect if dongle ID already selected
    if (dongleId()) return undefined

    const lastSelectedDongleId = storage.getItem('lastSelectedDongleId')
    if (devices()?.some((device) => device.dongle_id === lastSelectedDongleId)) return lastSelectedDongleId
    return devices()?.[0]?.dongle_id
  }

  return (
    <Drawer drawer={<DashboardDrawer />}>
      <Switch fallback={<TopAppBar leading={<DrawerToggleButton />}>No device</TopAppBar>}>
        <Match when={dongleId() === 'pair' || pairToken()}>
          <PairActivity />
        </Match>
        <Match when={isSharedDevice()}>
          <Show when={dateStr()} fallback={<Navigate href="/" />}>
            <SinglePaneLayout>
              <RouteActivity dongleId={dongleId()} dateStr={dateStr()} startTime={startTime()} />
            </SinglePaneLayout>
          </Show>
        </Match>
        <Match when={dongleId()} keyed>
          {(id) => (
            <TwoPaneLayout
              paneOne={<DeviceActivity dongleId={id} />}
              paneTwo={
                <Switch
                  fallback={
                    <div class="hidden size-full flex-col items-center justify-center gap-4 md:flex">
                      <Icon name="search" size="48" />
                      <span class="text-title-md">Select a route to view</span>
                    </div>
                  }
                >
                  <Match when={dateStr() === 'settings' || dateStr() === 'prime'}>
                    <SettingsActivity dongleId={id} />
                  </Match>
                  <Match when={dateStr()} keyed>
                    {(date) => <RouteActivity dongleId={id} dateStr={date} startTime={startTime()} />}
                  </Match>
                </Switch>
              }
              paneTwoContent={!!dateStr()}
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
