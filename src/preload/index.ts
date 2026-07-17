import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    setMode: (mode: 'pet' | 'room'): Promise<void> => ipcRenderer.invoke('window:set-mode', mode)
  },
  pet: {
    onSay: (listener: (message: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string): void =>
        listener(message)
      ipcRenderer.on('pet:say', handler)
      return () => ipcRenderer.removeListener('pet:say', handler)
    },
    onOpenRoom: (listener: () => void): (() => void) => {
      const handler = (): void => listener()
      ipcRenderer.on('app:open-room', handler)
      return () => ipcRenderer.removeListener('app:open-room', handler)
    }
  },
  character: {
    getDefault: (): Promise<unknown> => ipcRenderer.invoke('character:get-default')
  },
  conversation: {
    list: (characterId: string): Promise<unknown> =>
      ipcRenderer.invoke('conversation:list', characterId),
    send: (characterId: string, content: string): Promise<unknown> =>
      ipcRenderer.invoke('conversation:send', characterId, content)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
