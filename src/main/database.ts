import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'

export type MessageRole = 'companion' | 'user'

export interface CharacterRecord {
  id: string
  name: string
  status: string
  mood: string
  relationshipStartedAt: string
  bondLevel: number
  bondExperience: number
}

export interface MessageRecord {
  id: string
  characterId: string
  role: MessageRole
  content: string
  createdAt: string
}

let database: Database.Database | undefined

function getDatabase(): Database.Database {
  if (!database) throw new Error('Database has not been initialized')
  return database
}

export function initializeDatabase(): void {
  const databasePath = join(app.getPath('userData'), 'virtual-bond.db')
  database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')

  database.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      mood TEXT NOT NULL,
      relationship_started_at TEXT NOT NULL,
      bond_level INTEGER NOT NULL DEFAULT 1,
      bond_experience INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('companion', 'user')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS conversations_character_created_idx
      ON conversations(character_id, created_at);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  seedDefaultCharacter()
}

function seedDefaultCharacter(): void {
  const db = getDatabase()
  const characterId = 'chengxia'
  const exists = db.prepare('SELECT 1 FROM characters WHERE id = ?').get(characterId)
  if (exists) return

  const timestamp = new Date().toISOString()
  const relationshipStartedAt = new Date(Date.now() - 11 * 86_400_000).toISOString()
  const insertCharacter = db.prepare(`
    INSERT INTO characters (
      id, name, status, mood, relationship_started_at,
      bond_level, bond_experience, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertMessage = db.prepare(`
    INSERT INTO conversations (id, character_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    insertCharacter.run(
      characterId,
      '澄夏',
      '正在窗边听雨',
      '安静而亲近',
      relationshipStartedAt,
      3,
      58,
      timestamp,
      timestamp
    )
    insertMessage.run(
      randomUUID(),
      characterId,
      'companion',
      '你回来啦。今天外面下了很久的雨，我给你留了一小块安静的时间。',
      timestamp
    )
  })()
}

export function getDefaultCharacter(): CharacterRecord {
  const row = getDatabase()
    .prepare(
      `
      SELECT id, name, status, mood,
        relationship_started_at AS relationshipStartedAt,
        bond_level AS bondLevel,
        bond_experience AS bondExperience
      FROM characters
      ORDER BY created_at ASC
      LIMIT 1
    `
    )
    .get() as CharacterRecord | undefined

  if (!row) throw new Error('No character is available')
  return row
}

export function listMessages(characterId: string, limit = 100): MessageRecord[] {
  return getDatabase()
    .prepare(
      `
      SELECT id, character_id AS characterId, role, content, created_at AS createdAt
      FROM (
        SELECT * FROM conversations
        WHERE character_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      )
      ORDER BY created_at ASC
    `
    )
    .all(characterId, Math.min(Math.max(limit, 1), 500)) as MessageRecord[]
}

export function createMessage(
  characterId: string,
  role: MessageRole,
  content: string
): MessageRecord {
  const message: MessageRecord = {
    id: randomUUID(),
    characterId,
    role,
    content: content.trim(),
    createdAt: new Date().toISOString()
  }
  if (!message.content) throw new Error('Message content cannot be empty')

  getDatabase()
    .prepare(
      `
      INSERT INTO conversations (id, character_id, role, content, created_at)
      VALUES (@id, @characterId, @role, @content, @createdAt)
    `
    )
    .run(message)
  return message
}

export function createDemoReply(characterId: string): MessageRecord {
  return createMessage(
    characterId,
    'companion',
    '我听见了。这里还只是我们的第一间小屋，但我会慢慢记住你在意的事，也会保留自己的想法。'
  )
}

export function closeDatabase(): void {
  database?.close()
  database = undefined
}
