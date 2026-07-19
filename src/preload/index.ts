import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    setMode: (mode: 'pet' | 'room'): Promise<void> => ipcRenderer.invoke('window:set-mode', mode),
    showContextMenu: (): void => ipcRenderer.send('window:show-context-menu'),
    beginDrag: (): void => ipcRenderer.send('window:drag-start'),
    dragTo: (): void => ipcRenderer.send('window:drag-move'),
    endDrag: (): void => ipcRenderer.send('window:drag-end')
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
    send: (requestId: string, characterId: string, content: string): Promise<unknown> =>
      ipcRenderer.invoke('conversation:send', requestId, characterId, content),
    stop: (requestId: string): Promise<boolean> =>
      ipcRenderer.invoke('conversation:stop', requestId),
    onDelta: (listener: (payload: { requestId: string; delta: string }) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { requestId: string; delta: string }
      ): void => listener(payload)
      ipcRenderer.on('conversation:stream-delta', handler)
      return () => ipcRenderer.removeListener('conversation:stream-delta', handler)
    }
  },
  settings: {
    get: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
    save: (settings: unknown): Promise<unknown> => ipcRenderer.invoke('settings:save', settings),
    clearApiKey: (): Promise<unknown> => ipcRenderer.invoke('settings:clear-api-key'),
    reset: (): Promise<unknown> => ipcRenderer.invoke('settings:reset'),
    export: (): Promise<string> => ipcRenderer.invoke('settings:export'),
    importCcswitch: (
      preferredProvider?: 'openai' | 'anthropic' | 'gemini' | 'custom'
    ): Promise<unknown> => ipcRenderer.invoke('settings:import-ccswitch', preferredProvider),
    importText: (text: string): Promise<unknown> => ipcRenderer.invoke('settings:import-text', text)
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
