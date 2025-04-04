import { createSignal, lazy, onCleanup, Show, type ParentComponent, type VoidComponent } from 'solid-js'
import { Router, Route } from '@solidjs/router'
import { QueryClientProvider } from '@tanstack/solid-query'
import { SolidQueryDevtools } from '@tanstack/solid-query-devtools'
import { getAppQueryClient } from '~/api/query-client'

import 'leaflet/dist/leaflet.css'

const Login = lazy(() => import('./pages/auth/login'))
const Logout = lazy(() => import('./pages/auth/logout'))
const Auth = lazy(() => import('./pages/auth/auth'))

const Dashboard = lazy(() => import('./pages/dashboard'))

import OfflinePage from '~/pages/offline'
import { AppContextProvider } from '~/AppContext'

export const Routes = () => (
  <>
    <Route path="/login" component={Login} />
    <Route path="/logout" component={Logout} />
    <Route path="/auth" component={Auth} />

    <Route path="/*dongleId" component={Dashboard} />
  </>
)

export const AppLayout: ParentComponent = (props) => {
  const [isOnline, setIsOnline] = createSignal(navigator.onLine)
  const handleOnline = () => setIsOnline(true)
  const handleOffline = () => setIsOnline(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  onCleanup(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  })

  return (
    <Show when={isOnline()} fallback={<OfflinePage />}>
      <AppContextProvider>{props.children}</AppContextProvider>
    </Show>
  )
}

const queryClient = getAppQueryClient()

const App: VoidComponent = () => (
  <QueryClientProvider client={queryClient}>
    <SolidQueryDevtools />
    <Router root={AppLayout}>
      <Routes />
    </Router>
  </QueryClientProvider>
)

export default App
