# comma connect

The frontend to the comma connect progressive web app. This a react app using [Create React App](https://github.com/facebookincubator/create-react-app)

## Development
* Install pnpm: https://pnpm.io/installation
* Install dependencies: `pnpm install`
* Start dev server: `pnpm start`

## Contributing

If you don't have a comma device, connect has a demo mode with some example drives. This should allow for testing most functionality except for interactions with the device, such as getting the car battery voltage.

* Use best practices
* Write test cases
* Keep files small and clean
* Use branches / pull requests to isolate work. Don't do work that can't be merged quickly, find ways to break it up

## Libraries Used
There's a ton of them, but these are worth mentioning because they sort of affect everything.

 * `React` - Object oriented components with basic lifecycle callbacks rendered by state and prop changes.
 * `Redux` - Sane formal *global* scope. This is not a replacement for component state, which is the best way to store local component level variables and trigger re-renders. Redux state is for global state that many unrelated components care about. No free-form editing, only specific pre-defined actions. [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd?hl=en) can be very helpful.
 * `@material-ui` - Lots of fully featured highly customizable components for building the UIs with. Theming system with global and per-component overrides of any CSS values.
 * `react-router-redux` - the newer one, 5.x.... Mindlessly simple routing with convenient global access due to redux

## How things work
The current playback is tracked not by storing the current offset, but instead storing the local time that the player began, the offset it began at, and the playback rate. Any time any of these values change, it rebases them all back to the current time. It means that at any arbitrary moment you can calculate the current offset with...
```js
(Date.now() - state.startTime) * state.playSpeed + state.offset
```

With this central authority on current offset time, it becomes much easier to have each data source keep themselves in sync instead of trying to manage synchronizing all of them.