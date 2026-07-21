import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type MessageRole = 'companion' | 'user'
export type MessageStatus = 'completed' | 'sending' | 'stopped' | 'failed'

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
  status: MessageStatus
  error: string | null
  createdAt: string
  updatedAt: string
}

interface Migration {
  version: number
  apply: (db: Database.Database) => void
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return columns.some((item) => item.name === column)
}

const migrations: Migration[] = [
  {
    version: 1,
    apply: (db) => {
      db.exec(`
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
          status TEXT NOT NULL DEFAULT 'completed'
            CHECK(status IN ('completed', 'sending', 'stopped', 'failed')),
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS conversations_character_created_idx
          ON conversations(character_id, created_at);

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    }
  },
  {
    version: 2,
    apply: (db) => {
      if (!columnExists(db, 'conversations', 'status')) {
        db.exec(`
          ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'
            CHECK(status IN ('completed', 'sending', 'stopped', 'failed'))
        `)
      }
      if (!columnExists(db, 'conversations', 'error')) {
        db.exec('ALTER TABLE conversations ADD COLUMN error TEXT')
      }
      if (!columnExists(db, 'conversations', 'updated_at')) {
        db.exec("ALTER TABLE conversations ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
      }
      db.exec(`
        UPDATE conversations
        SET updated_at = created_at
        WHERE updated_at = '' OR updated_at IS NULL
      `)
    }
  },
  {
    version: 3,
    apply: (db) => {
      const legacy = db.prepare("SELECT 1 FROM characters WHERE id = 'chengxia'").get()
      if (!legacy) return

      const timestamp = new Date().toISOString()
      db.prepare(
        `
          INSERT OR IGNORE INTO characters (
            id, name, status, mood, relationship_started_at,
            bond_level, bond_experience, created_at, updated_at
          )
          SELECT
            'makise-kurisu', '牧濑红莉栖', '正在整理实验记录', '冷静而专注',
            relationship_started_at, bond_level, bond_experience, created_at, ?
          FROM characters
          WHERE id = 'chengxia'
        `
      ).run(timestamp)
      db.exec(`
        UPDATE conversations
        SET character_id = 'makise-kurisu'
        WHERE character_id = 'chengxia'
          AND EXISTS (SELECT 1 FROM characters WHERE id = 'makise-kurisu');

        DELETE FROM characters
        WHERE id = 'chengxia'
          AND EXISTS (SELECT 1 FROM characters WHERE id = 'makise-kurisu');
      `)
    }
  }
]

export class DatabaseStore {
  private readonly db: Database.Database

  constructor(databasePath: string) {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.applyMigrations()
    this.seedDefaultCharacter()
    this.recoverInterruptedMessages()
  }

  private applyMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `)
    const applied = new Set(
      (
        this.db.prepare('SELECT version FROM schema_migrations').all() as Array<{
          version: number
        }>
      ).map(({ version }) => version)
    )
    const insertMigration = this.db.prepare(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
    )

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue
      this.db.transaction(() => {
        migration.apply(this.db)
        insertMigration.run(migration.version, new Date().toISOString())
      })()
    }
  }

  private recoverInterruptedMessages(): void {
    this.db
      .prepare(
        `
          UPDATE conversations
          SET status = 'failed',
            error = '上次生成意外中断，请重新发送',
            updated_at = ?
          WHERE status = 'sending'
        `
      )
      .run(new Date().toISOString())
  }

  private seedDefaultCharacter(): void {
    const characterId = 'makise-kurisu'
    const exists = this.db.prepare('SELECT 1 FROM characters WHERE id = ?').get(characterId)
    if (exists) return

    const timestamp = new Date().toISOString()
    const relationshipStartedAt = new Date(Date.now() - 11 * 86_400_000).toISOString()
    const insertCharacter = this.db.prepare(`
      INSERT INTO characters (
        id, name, status, mood, relationship_started_at,
        bond_level, bond_experience, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMessage = this.db.prepare(`
      INSERT INTO conversations (
        id, character_id, role, content, status, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'completed', NULL, ?, ?)
    `)

    this.db.transaction(() => {
      insertCharacter.run(
        characterId,
        '牧濑红莉栖',
        '正在整理实验记录',
        '冷静而专注',
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
        '你回来了。外面的雨下了很久……先坐一会儿吧。',
        timestamp,
        timestamp
      )
    })()
  }

  private selectMessage(id: string): MessageRecord {
    const message = this.db
      .prepare(
        `
          SELECT id, character_id AS characterId, role, content, status, error,
            created_at AS createdAt, updated_at AS updatedAt
          FROM conversations
          WHERE id = ?
        `
      )
      .get(id) as MessageRecord | undefined
    if (!message) throw new Error('Message does not exist')
    return message
  }

  getDefaultCharacter(): CharacterRecord {
    const row = this.db
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

  listMessages(characterId: string, limit = 100): MessageRecord[] {
    return this.db
      .prepare(
        `
          SELECT id, character_id AS characterId, role, content, status, error,
            created_at AS createdAt, updated_at AS updatedAt
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

  createMessage(characterId: string, role: MessageRole, content: string): MessageRecord {
    const normalizedContent = content.trim()
    if (!normalizedContent) throw new Error('Message content cannot be empty')
    const timestamp = new Date().toISOString()
    const message: MessageRecord = {
      id: randomUUID(),
      characterId,
      role,
      content: normalizedContent,
      status: 'completed',
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    this.db
      .prepare(
        `
          INSERT INTO conversations (
            id, character_id, role, content, status, error, created_at, updated_at
          ) VALUES (@id, @characterId, @role, @content, @status, @error, @createdAt, @updatedAt)
        `
      )
      .run(message)
    return message
  }

  createPendingCompanionMessage(characterId: string): MessageRecord {
    const timestamp = new Date().toISOString()
    const message: MessageRecord = {
      id: randomUUID(),
      characterId,
      role: 'companion',
      content: '',
      status: 'sending',
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    this.db
      .prepare(
        `
          INSERT INTO conversations (
            id, character_id, role, content, status, error, created_at, updated_at
          ) VALUES (@id, @characterId, @role, @content, @status, @error, @createdAt, @updatedAt)
        `
      )
      .run(message)
    return message
  }

  updateCompanionMessage(
    id: string,
    content: string,
    status: Exclude<MessageStatus, 'sending'>,
    error: string | null = null
  ): MessageRecord {
    this.db
      .prepare(
        `
          UPDATE conversations
          SET content = ?, status = ?, error = ?, updated_at = ?
          WHERE id = ? AND role = 'companion'
        `
      )
      .run(content.trim(), status, error, new Date().toISOString(), id)
    return this.selectMessage(id)
  }

  getSetting<T>(key: string, fallback: T): T {
    const row = this.db
      .prepare('SELECT value_json AS valueJson FROM app_settings WHERE key = ?')
      .get(key) as { valueJson: string } | undefined
    if (!row) return fallback

    try {
      return JSON.parse(row.valueJson) as T
    } catch {
      return fallback
    }
  }

  setSetting<T>(key: string, value: T): void {
    this.db
      .prepare(
        `
          INSERT INTO app_settings (key, value_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
        `
      )
      .run(key, JSON.stringify(value), new Date().toISOString())
  }

  getAppliedMigrationVersions(): number[] {
    return (
      this.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
        version: number
      }>
    ).map(({ version }) => version)
  }

  close(): void {
    this.db.close()
  }
}
