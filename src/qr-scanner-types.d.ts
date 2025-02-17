declare module 'qr-scanner' {
  export interface QrScannerResult {
    data: string
  }
  
  export default class QrScanner {
    constructor(
      video: HTMLVideoElement,
      onResult: (result: QrScannerResult) => void,
      options?: { highlightScanRegion?: boolean }
    )
    start(): Promise<void>
    destroy(): void
  }
}

declare module 'qr-scanner/qr-scanner-worker.min.js' 