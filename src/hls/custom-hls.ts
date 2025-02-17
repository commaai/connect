import Hls from 'hls.js/dist/hls.light.mjs'
import { config } from './custom-config'

export function createHls(): Hls {
  return new Hls(config)
} 