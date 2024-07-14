import {
  AllAppleDeviceNames,
  combinePresetAndAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

import { readFile } from 'node:fs/promises'

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: combinePresetAndAppleSplashScreens(
    minimal2023Preset,
    {
      // dark splash screens using black background (the default)
      darkResizeOptions: { background: 'black', fit: 'contain' },
      // or using a custom background color
      // darkResizeOptions: { background: '#1f1f1f' },
      async darkImageResolver(imageName) {
        return imageName === 'public/logo-connect-light.svg'
          ? await readFile('public/logo-connect-dark.svg')
          : undefined
      },
    },

    AllAppleDeviceNames,
  ),
  images: ['public/logo-connect-light.svg'],
})
