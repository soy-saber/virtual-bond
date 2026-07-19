import { ElectronAPI } from '@electron-toolkit/preload'

interface VirtualBondAPI {
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    setMode: (mode: 'pet' | 'room') => Promise<void>
    getPetScale: () => Promise<number>
    setPetScale: (scale: number) => Promise<number>
    showContextMenu: () => void
    beginDrag: () => void
    dragTo: () => void
    endDrag: () => void
  }
  pet: {
    onSay: (listener: (message: string) => void) => () => void
    onOpenRoom: (listener: () => void) => () => void
    onReturnToPet: (listener: () => void) => () => void
  }
  skins: {
    list: () => Promise<SkinScanView>
    loadAnimation: (skinId: string, action: string) => Promise<SkinAnimationAssetView>
    openUserDirectory: () => Promise<void>
  }
  character: {
    getDefault: () => Promise<CharacterRecord>
  }
  conversation: {
    list: (characterId: string) => Promise<MessageRecord[]>
    send: (requestId: string, characterId: string, content: string) => Promise<SendMessageResult>
    stop: (requestId: string) => Promise<boolean>
    onDelta: (listener: (payload: ConversationDelta) => void) => () => void
  }
  settings: {
    get: () => Promise<ProviderSettingsView>
    save: (settings: ProviderSettingsDraft) => Promise<ProviderSettingsView>
    clearApiKey: () => Promise<ProviderSettingsView>
    reset: () => Promise<ProviderSettingsView>
    export: () => Promise<string>
    importCcswitch: (preferredProvider?: ProviderKind) => Promise<ProviderSettingsView>
    importText: (text: string) => Promise<ProviderSettingsView>
  }
}

interface CharacterRecord {
  id: string
  name: string
  status: string
  mood: string
  relationshipStartedAt: string
  bondLevel: number
  bondExperience: number
}

interface MessageRecord {
  id: string
  characterId: string
  role: 'companion' | 'user'
  content: string
  status: 'completed' | 'sending' | 'stopped' | 'failed'
  error: string | null
  createdAt: string
  updatedAt: string
}

interface SendMessageResult {
  userMessage: MessageRecord
  companionMessage: MessageRecord
  status: 'completed' | 'stopped' | 'failed'
  error?: string
}

interface ConversationDelta {
  requestId: string
  delta: string
}

interface SkinScanView {
  skins: Array<{
    source: 'builtin' | 'user' | 'development'
    manifest: {
      id: string
      name: string
      version: number
      canvas: {
        width: number
        height: number
        anchor: { x: number; y: number }
        hitbox?: { x: number; y: number; width: number; height: number }
      }
      flipHorizontal: boolean
      animations: Record<
        string,
        {
          file: string
          frameWidth: number
          frameHeight: number
          frames: number
          columns: number
          rows: number
          margin: number
          spacing: number
          fps: number
          loop: boolean
          next?: string
        }
      >
    }
  }>
  invalid: Array<{
    source: 'builtin' | 'user' | 'development'
    directoryName: string
    error: string
  }>
}

interface SkinAnimationAssetView {
  skinId: string
  action: string
  mimeType: 'image/png'
  bytes: Uint8Array
  canvas: {
    width: number
    height: number
    anchor: { x: number; y: number }
    hitbox?: { x: number; y: number; width: number; height: number }
  }
  animation: SkinScanView['skins'][number]['manifest']['animations'][string]
}

type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'custom'

interface ProviderSettingsDraft {
  provider: ProviderKind
  name: string
  baseUrl: string
  model: string
  systemPrompt: string
  apiKey?: string
}

interface ProviderSettingsView {
  provider: ProviderKind
  name: string
  baseUrl: string
  model: string
  systemPrompt: string
  source: string
  updatedAt: string
  apiKeyPresent: boolean
  apiKeyHint: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: VirtualBondAPI
  }
}
