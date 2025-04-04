import { http, HttpResponse } from 'msw'

import { API_URL } from '~/api/config'
import type { Profile } from '~/types'

const api = (path: string) => new URL(path, API_URL).toString()

export const handlers = [
  http.get(api('/v1/me'), () =>
    HttpResponse.json<Profile>({
      id: '0123456789abcdef',
      email: 'user@comma.ai',
      regdate: 1735689600,
      superuser: true,
      user_id: 'google_0123456789abcdef',
    }),
  ),
]
