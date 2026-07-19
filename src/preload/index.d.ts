import { ElectronAPI } from '@electron-toolkit/preload'

interface VirtualBondAPI {
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    setMode: (mode: 'pet' | 'room') => Promise<void>
    showContextMenu: () => void
    beginDrag: (screenX: number, screenY: number) => void
    dragTo: (screenX: number, screenY: number) => void
    endDrag: () => void
  }
  pet: {
    onSay: (listener: (message: string) => void) => () => void
    onOpenRoom: (listener: () => void) => () => void
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
