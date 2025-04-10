import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'

import { getProfile } from '~/api/profile'
import { server } from './mocks/node'

beforeAll(() => {
  server.listen()
  server.events.on('request:start', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
  })
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

test('msw', async () => {
  const profile = await getProfile()
  expect(profile).toMatchObject({
    email: 'user@comma.ai',
  })
})
