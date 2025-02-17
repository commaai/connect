export interface ApiResponseBase {
  fetched_at: number
}

export interface Profile {
  email: string
  id: string
  regdate: number
  superuser: boolean
  user_id: string
}

export interface DeviceLocation extends ApiResponseBase {
  lat: number
  lng: number
  time: number
  accuracy: number
  speed: number
  bearing: number
}

export interface Device extends ApiResponseBase {
  dongle_id: string
  alias: string
  serial: string
  last_athena_ping: number
  ignore_uploads: boolean | null
  is_paired: boolean
  is_owner: boolean
  public_key: string
  prime: boolean
  prime_type: number
  trial_claimed: boolean
  device_type: string
  openpilot_version: string
  sim_id: string
  sim_type: number
  eligible_features: {
    prime: boolean
    prime_data: boolean
    nav: boolean
  }
}

export interface DrivingStatisticsAggregation {
  distance: number
  minutes: number
  routes: number
}

export interface DrivingStatistics {
  all: DrivingStatisticsAggregation
  week: DrivingStatisticsAggregation
}

export interface DeviceUser {
  email: string
  permission: 'read_access' | 'owner'
}

export interface Route extends ApiResponseBase {
  can?: boolean
  create_time: number
  devicetype: number
  dongle_id: string
  end_lat?: number
  end_lng?: number
  end_time?: string
  fullname: string
  git_branch?: string
  git_commit?: string
  git_dirty?: boolean
  git_remote?: string
  hpgps?: boolean
  init_logmonotime?: number
  is_public: boolean
  is_preserved: boolean
  length?: number
  maxcamera: number
  maxdcamera: number
  maxecamera: number
  maxlog: number
  maxqcamera: number
  maxqlog: number
  passive?: boolean
  platform?: string
  proccamera: number
  proclog: number
  procqcamera: number
  procqlog: number
  radar?: boolean
  start_time: string
  url: string
  user_id: string | null
  version?: string
  vin?: string
}

export interface RouteShareSignature extends Record<string, string> {
  exp: string
  sig: string
}

export interface RouteSegments extends Route {
  end_time_utc_millis: number
  is_preserved: boolean
  share_exp: RouteShareSignature['exp']
  share_sig: RouteShareSignature['sig']
  start_time_utc_millis: number
}
