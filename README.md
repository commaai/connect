# connect

This is a rewrite of [comma connect](https://github.com/commaai/connect), the web (and mobile) experience for [openpilot](https://github.com/commaai/openpilot).

Try it out at https://new-connect.connect-d5y.pages.dev.

## Development

- Install bun: https://bun.sh
- Install dependencies: `bun install`
- Start dev server: `bun dev --open`

For a full fresh setup in `$HOME`:
```bash
curl -fsSL https://bun.sh/install | bash

cd ~
git clone git@github.com:commaai/new-connect.git

cd new-connect
bun install
bun dev
```

## PWA Setup

PWA icons and splash screens are automatically generated using [pwa-asset-generator](https://github.com/elegantapp/pwa-asset-generator), which also updates the HTML metadata tags accordingly. Asset generation settings can be configured in the generate-pwa-assets script in package.json.

## Contributing

Join the `#dev-connect-web` channel on our [Discord](https://discord.comma.ai).

connect has a demo mode, so no special comma device is needed to develop connect.

A few constraints to keep connect light and the dev environment fun:
* 5k line limit
* 500KB bundle size limit
* 1m timeout for all CI

References:
* [API docs](https://api.comma.ai)
* [openpilot docs](https://docs.comma.ai)
* [Discord](https://discord.comma.ai)
* [Bounties](https://comma.ai/bounties) 

## Roadmap

The first goal is to replace current connect and get this shipped to https://connect.comma.ai.

[This milestone](https://github.com/commaai/new-connect/milestone/1) tracks that progress. Most of the issues there are [paid bounties](https://comma.ai/bounties).

Once we've shipped v1, next up will be:
* [Sentry mode](https://www.youtube.com/watch?v=laO0RzsDzfU)
* SSH console for openpilot developers
* Replace snapshot with a live stream
* openpilot clips, like this [community tool](https://github.com/nelsonjchen/op-replay-clipper)
* Manage the settings on your comma 3X
* Car mangement: lock doors, EV charge status, etc.
