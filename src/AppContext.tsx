import { createContext, JSX, useContext } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Device, Profile, Route } from './api/types'
import { TimelineEvent, TimelineStatistics } from './api/derived'

interface AppState {
  currentDevice: Device | undefined
  currentEvents: TimelineEvent[] | undefined
  currentProfile: Profile | undefined
  currentRoute: Route | undefined
  currentTimelineStatistics: TimelineStatistics | undefined
}

const INITIAL_STATE: AppState = {
  currentDevice: undefined,
  currentEvents: undefined,
  currentProfile: undefined,
  currentRoute: undefined,
  currentTimelineStatistics: undefined,
}

export const AppContext = createContext([
  INITIAL_STATE,
  {
    setCurrentDevice: (_device: Device) => {},
    setCurrentRoute: (_route: Route) => {},
    setCurrentEvents: (_events: TimelineEvent[]) => {},
    setCurrentProfile: (_profile: Profile) => {},
    setCurrentTimelineStatistics: (_timelineStatistics: TimelineStatistics | undefined) => {},
  },
] as const)

export const AppContextProvider = (props: { children: JSX.Element }) => {
  const [state, setState] = createStore<AppState>(INITIAL_STATE)

  const app = [
    state,
    {
      setCurrentDevice: (device: Device) => setState('currentDevice', device),
      setCurrentRoute: (route: Route) => setState('currentRoute', route),
      setCurrentEvents: (events: TimelineEvent[]) => setState('currentEvents', events),
      setCurrentProfile: (profile: Profile) => setState('currentProfile', profile),
      setCurrentTimelineStatistics: (timelineStatistics: TimelineStatistics | undefined) =>
        setState('currentTimelineStatistics', timelineStatistics),
    },
  ] as const

  return <AppContext.Provider value={app}>{props.children}</AppContext.Provider>
}

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) throw new Error('Could not find an AppContext!')
  return context
}
