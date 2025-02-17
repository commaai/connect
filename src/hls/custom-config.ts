import type { HlsConfig } from 'hls.js'

export const config: Partial<HlsConfig> = {
  debug: false,
  enableWorker: true,
  enableSoftwareAES: false,
  enableWebVTT: false,
  enableIMSC1: false,
  enableCEA708Captions: false,
} 