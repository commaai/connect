/* @refresh reload */
import './index.css'

import 'solid-devtools'
import * as Sentry from '@sentry/solid'
import { render } from 'solid-js/web'
import App from './App'

const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined
Sentry.init({
  enabled: !!environment,
  dsn: 'https://c3402db23a1a02fe83b7a43b7dbbbac0@o33823.ingest.us.sentry.io/4508738328854529',
  environment,
})

const root = document.getElementById('root')

if (!root) throw new Error('No #root element found in the DOM.')

render(() => <App />, root)
