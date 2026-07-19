import { app } from 'electron'
import { join } from 'path'
import {
  DatabaseStore,
  type CharacterRecord,
  type MessageRecord,
  type MessageRole,
  type MessageStatus
} from './database-core'

export type { CharacterRecord, MessageRecord, MessageRole, MessageStatus } from './database-core'

let store: DatabaseStore | undefined

function getStore(): DatabaseStore {
  if (!store) throw new Error('Database has not been initialized')
  return store
}

export function initializeDatabase(): void {
  store = new DatabaseStore(join(app.getPath('userData'), 'virtual-bond.db'))
}

export function getDefaultCharacter(): CharacterRecord {
  return getStore().getDefaultCharacter()
}

export function listMessages(characterId: string, limit = 100): MessageRecord[] {
  return getStore().listMessages(characterId, limit)
}

export function createMessage(
  characterId: string,
  role: MessageRole,
  content: string
): MessageRecord {
  return getStore().createMessage(characterId, role, content)
}

export function createPendingCompanionMessage(characterId: string): MessageRecord {
  return getStore().createPendingCompanionMessage(characterId)
}

export function updateCompanionMessage(
  id: string,
  content: string,
  status: Exclude<MessageStatus, 'sending'>,
  error: string | null = null
): MessageRecord {
  return getStore().updateCompanionMessage(id, content, status, error)
}

export function getSetting<T>(key: string, fallback: T): T {
  return getStore().getSetting(key, fallback)
}

export function setSetting<T>(key: string, value: T): void {
  getStore().setSetting(key, value)
}

export function closeDatabase(): void {
  store?.close()
  store = undefined
}
