import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { configure, render, waitFor } from '@solidjs/testing-library'

import { clearAccessToken, setAccessToken } from '~/api/auth/client'
import * as Demo from '~/api/auth/demo'
import { Routes } from './App'

const DEMO_LOG_ID = '000000dd--455f14369d'

const renderApp = (location: string) => render(() => <Routes />, { location })

beforeAll(() => configure({ asyncUtilTimeout: 2000 }))
beforeEach(() => clearAccessToken())

test('Show login page', async () => {
  const { findByText } = renderApp('/')
  expect(await findByText('Sign in with Google')).not.toBeFalsy()
})

describe('Demo mode', () => {
  beforeEach(() => setAccessToken(Demo.ACCESS_TOKEN))

  test('View dashboard', async () => {
    const { findByText } = renderApp('/')
    expect(await findByText('demo 3X')).not.toBeFalsy()
  })

  test('View demo route', async () => {
    const { findByText, findByTestId } = renderApp(`/${Demo.DONGLE_ID}/${DEMO_LOG_ID}`)
    expect(await findByText(DEMO_LOG_ID)).not.toBeFalsy()
    const video = (await findByTestId('route-video')) as HTMLVideoElement
    await waitFor(() => expect(video.src).toBeTruthy())
  })
})

// TODO: write tests/setup second demo for read-only access tests

describe('Public routes', () => {
  test('Require route ID in URL', async () => {
    const { findByText } = renderApp(`/${Demo.DONGLE_ID}`)
    expect(await findByText('Sign in with Google')).toBeTruthy()
  })

  test('View public route without signing in', async () => {
    const { findByText } = renderApp(`/${Demo.DONGLE_ID}/${DEMO_LOG_ID}`)
    expect(await findByText(DEMO_LOG_ID)).toBeTruthy()
    // Videos do not load, yet
    // const video = (await findByTestId('route-video')) as HTMLVideoElement
    // await waitFor(() => expect(video.src).toBeTruthy())
  })

  test('View public route while signed in as another user', async () => {
    setAccessToken(Demo.ACCESS_TOKEN)
    const { findByText } = renderApp(`/e886087f430e7fe7/00000221--604653e929`)
    expect(await findByText('00000221--604653e929')).toBeTruthy()
  })
})
