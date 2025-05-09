import type { ApiDevice, AthenaOfflineQueueResponse, Device, DeviceLocation, DrivingStatistics } from '~/api/types'
import { fetcher } from '.'

const sortDevices = (devices: ApiDevice[]) =>
  devices.sort((a, b) => {
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

const createDevice = (device: ApiDevice): Device => ({
  ...device,
  is_online: !!device.last_athena_ping && device.last_athena_ping >= Math.floor(Date.now() / 1000) - 120,
})

export const SHARED_DEVICE = 'Shared Device'

const createSharedDevice = (dongleId: string): Device => ({
  dongle_id: dongleId,
  alias: SHARED_DEVICE,
  serial: '',
  last_athena_ping: 0,
  ignore_uploads: null,
  is_paired: true,
  is_owner: false,
  public_key: '',
  prime: false,
  prime_type: 0,
  trial_claimed: false,
  device_type: '',
  openpilot_version: '',
  sim_id: '',
  sim_type: 0,
  eligible_features: {
    prime: false,
    prime_data: false,
    nav: false,
  },
  is_online: false,
})

export const getDevice = async (dongleId: string): Promise<Device> => {
  try {
    const device = await fetcher<ApiDevice>(`/v1.1/devices/${dongleId}/`)
    return createDevice(device)
  } catch {
    return createSharedDevice(dongleId)
  }
}

export const getAthenaOfflineQueue = (dongleId: string) =>
  fetcher<AthenaOfflineQueueResponse>(`/v1/devices/${dongleId}/athena_offline_queue`)

export const getDeviceLocation = async (dongleId: string) =>
  fetcher<DeviceLocation>(`/v1/devices/${dongleId}/location`).catch(() => undefined)

export const getDeviceStats = async (dongleId: string) =>
  fetcher<DrivingStatistics>(`/v1.1/devices/${dongleId}/stats`).catch(() => undefined)

export const getDevices = async (): Promise<Device[]> =>
  fetcher<ApiDevice[]>('/v1/me/devices/')
    .then(sortDevices)
    .then((devices) => devices.map(createDevice))
    .catch(() => [])

export const unpairDevice = async (dongleId: string) =>
  fetcher<{ success: number }>(`/v1/devices/${dongleId}/unpair`, {
    method: 'POST',
  })

export const grantDeviceReadPermission = async (dongleId: string, email: string) =>
  fetcher<{ success: number }>(`/v1/devices/${dongleId}/add_user`, {
    method: 'POST',
    body: JSON.stringify({ email: email }),
    headers: {
      'Content-Type': 'application/json',
    },
  })

export const removeDeviceReadPermission = async (dongleId: string, email: string) =>
  fetcher<{ success: number }>(`/v1/devices/${dongleId}/del_user`, {
    method: 'POST',
    body: JSON.stringify({ email: email }),
    headers: {
      'Content-Type': 'application/json',
    },
  })

export const getDeviceUsers = async (dongleId: string): Promise<{ email: string; permission: string }[]> =>
  fetcher<{ email: string; permission: string }[]>(`/v1/devices/${dongleId}/users`)

const validatePairToken = (
  input: string,
): {
  identity: string
  token: string
} | null => {
  let token: string | null = input
  try {
    token = new URL(input).searchParams.get('pair')
  } catch (_) {
    /* empty */
  }
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    // jwt is base64url encoded
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const { identity, pair } = JSON.parse(payload) as Record<string, unknown>
    if (pair !== true || typeof identity !== 'string') return null
    return { identity, token }
  } catch (_) {
    return null
  }
}

export const pairDevice = async (pairToken: string): Promise<string> => {
  const token = validatePairToken(pairToken)
  if (!token) throw new Error('invalid pair code or QR code')

  const body = new FormData()
  body.append('pair_token', token.token)
  try {
    await fetcher('/v2/pilotpair/', { method: 'POST', body })
    return token.identity
  } catch (error) {
    if (!(error instanceof Error) || !(error.cause instanceof Response)) {
      throw error
    }
    const msg =
      {
        400: 'invalid request',
        401: 'could not decode token - make sure your comma device is connected to the internet',
        403: 'device paired with different owner - make sure you signed in with the correct account',
        404: 'tried to pair invalid device',
        417: 'pair token not true',
      }[error.cause.status] ?? 'unable to pair'
    throw new Error(msg, { cause: error.cause })
  }
}
