import { getAccessToken } from './auth/client'
import { API_URL } from './config'

const populateFetchedAt = <T>(item: T): T => {
  return {
    ...item,
    fetched_at: Math.floor(Date.now() / 1000),
  }
}

export async function fetcher<T>(endpoint: string, init?: RequestInit, apiUrl: string = API_URL): Promise<T> {
  const req = new Request(`${apiUrl}${endpoint}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `JWT ${getAccessToken()}`,
    },
  })
  const res = await fetch(req)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${req.method} ${req.url} ${res.status}`, { cause: res })
  }
  // biome-ignore lint/suspicious/noImplicitAnyLet: TODO: validate server response
  let json
  try {
    json = await JSON.parse(text)
  } catch (err) {
    throw new Error('Failed to parse response from server', { cause: err })
  }
  if (json.error) {
    throw new Error(`Server error: ${json.description}`, { cause: json })
  }
  if (Array.isArray(json)) {
    return json.map(populateFetchedAt) as T
  } else if (typeof json === 'object') {
    return populateFetchedAt(json)
  } else {
    throw new Error(`Unexpected response type: ${typeof json}. Expected either type array or object.`)
  }
}
