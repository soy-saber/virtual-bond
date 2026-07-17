import { ElectronAPI } from '@electron-toolkit/preload'

interface VirtualBondAPI {
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
  }
  character: {
    getDefault: () => Promise<CharacterRecord>
  }
  conversation: {
    list: (characterId: string) => Promise<MessageRecord[]>
    send: (characterId: string, content: string) => Promise<SendMessageResult>
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
  createdAt: string
}

interface SendMessageResult {
  userMessage: MessageRecord
  companionMessage: MessageRecord
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: VirtualBondAPI
  }
}
