# comma connect

The frontend to the comma connect progressive web app. This a react app using [Create React App](https://github.com/facebookincubator/create-react-app)

## Environments
 * Development (local machine) http://localhost:3000
 * Staging (docker)
   * packages/images are build by CI, and put on staging branch
 * Production (docker) https://connect.comma.ai
   * pushed manually

## Libraries Used
There's a ton of them, but these are worth mentioning because they sort of affect everything.

 * `React` - If you don't know react, stop everything you're doing and go learn it. It's simple object oriented components with basic lifecycle callbacks rendered by state and prop changes.
 * `Redux` - Sane formal *global* scope. This is not a replacement for component state, which is the best way to store local component level variables and trigger re-renders. Redux state is for global state that many unrelated components care about. No free-form editing, only specific pre-defined actions
 * `@material-ui` - Lots of fully featured highly customizable components for building the UIs with. Theming system with global and per-component overrides of any CSS values.
 * `react-router-redux` - the newer one, 5.x.... Mindlessly simple routing with convenient global access due to redux

Smaller libraries... useful things scattered everywhere that seemed worth mentioning for one reason or another.
* `geval` - Really simple event object with no string comparisons on listen/broadcast. Listen function also returns an unlisten function which is the preferred API style for listeners
* `raf` - all high performance rendering is done within raf loops
* `hls.js` - Video playback
* `obstruction` - declarative object transforming, useful for defining mapToProps functions for react-redux.

## Project Layout

 * `src/` contains the main app
 * `src/timeline` contains the API for timeline data
   * `src/timeline/index/js` is an API wrapper exposing sane methods
   * `src/timeline/index.sharedworker.js` is the sharedworker implementation of the timeline data
   * `src/timeline/index.worker.js` is the non-shared web worker for when browsers don't support shared workers
   * Basically everything else in `src/timeline` is implementation of the worker. A few files / helper functions are used both in and out of the worker (such as the currentOffset function)
 * `src/index.js` is the entrypoint for the app. It doesn't care about auth, and only sets up global caching things and CSS reset/themes
 * `src/App.js` is the root app. It handles all the authentication walls and high level non-app routes (such as settings or user management)
 * `src/components/` contains all of the React components. Most top-level files are screen-level components, such as the explorer app itself or any other routes added in App.js. Most components, reusable or not, are in folders within components. Complex components should be broken up into smaller files within one of these folders so their code can remain simple while still exposing complex functionality over an interface.
   * `src/components/explorer.js` is the root component for all the explorer "app" functionality. This is where the granular routes go
 * `src/api` root folder for all API communications
   * `src/api/auth` handles trying to find the auth token for the user in any location it could be stored. It also tries to store the auth token in IndexDB so that the shared worker can get it for free.
   * `src/api/request` wraps all the request types (get/post/etc) and configures the `config-request` instance.
   * `src/api/index.js` is the only file that should be accessed by normal application code. It should expose every available endpoint as a specific API rather than expecting endpoint names as strings (example, `API.listDevices()` not `API.get("listDevices")`)

## How things works
Everything functions by talking to a central Web/Shared worker. The current playback is tracked not by storing the current offset, but instead storing the local time that the player began, the offset it began at, and the playback rate. Any time any of these values change, it rebases them all back to the current time. It means that at any arbitrary moment you can calculate the current offset with...
```js
(Date.now() - state.startTime) * state.playSpeed + state.offset
```
This is exposed through `Timelineworker.currentOffset()`.

With this central authority on current offset time, it becomes much easier to have each data source keep themselves in sync instead of trying to manage synchronizing all of them.

## Development
`yarn start`

## Contributing

 * Use best practices
 * Write test cases
 * Keep files small and clean
 * Use branches / pull requests to isolate work. Don't do work that can't be merged quickly, find ways to break it up
