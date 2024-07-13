import type { Device, DrivingStatistics, WithFetchedAt } from '~/types'

import { fetcher } from '.'

const sortDevices = (devices: Device[]): Device[] => {
  return devices.sort((a, b) => {
    if (a.is_owner !== b.is_owner) {
      return a.is_owner ? -1 : 1
    } else if (a.alias && b.alias) {
      return a.alias.localeCompare(b.alias)
    } else if (!a.alias && !b.alias) {
      return a.dongle_id.localeCompare(b.dongle_id)
    } else {
      return a.alias ? -1 : 1
    }
  })
}

const populateFetchedAt = <T>(item: T): WithFetchedAt<T> => {
  return {
    ...item,
    fetched_at: Math.floor(Date.now() / 1000),
  }
}

export const getDevice = async (dongleId: string) =>
  fetcher<Device>(`/v1.1/devices/${dongleId}/`)
    .then(populateFetchedAt)

export const getDeviceStats = async (dongleId: string) =>
  fetcher<DrivingStatistics>(`/v1.1/devices/${dongleId}/stats`)

export const getDevices = async () =>
  fetcher<Device[]>('/v1/me/devices/')
    .then(sortDevices)
    .then(sortedDevices => sortedDevices.map(populateFetchedAt))
    .catch(() => [])
