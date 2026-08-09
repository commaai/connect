// connect authenticates with a JWT in localStorage and is served as static
// files, so there is no server to render against and nothing to prerender
// behind the auth gate. adapter-static's SPA fallback does the rest.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'ignore';

/** Runs in the browser only, because ssr is disabled above. */
export function load() {
  const mockScenario = import.meta.env.VITE_MOCK_SCENARIO;

  if (import.meta.env.VITE_MOCK_API === 'true') {
    // Match the dev mock backend: seed a session so every screen is reachable
    // with no device, except in the scenario that exercises the signed-out UI.
    if (mockScenario === 'anonymous') localStorage.removeItem('authorization');
    else localStorage.setItem('authorization', 'mock-token');
  }

  return { mockScenario: import.meta.env.VITE_MOCK_API === 'true' ? mockScenario : null };
}
