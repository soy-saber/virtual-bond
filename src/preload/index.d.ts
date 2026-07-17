import { ElectronAPI } from '@electron-toolkit/preload'

interface VirtualBondAPI {
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: VirtualBondAPI
  }
}
