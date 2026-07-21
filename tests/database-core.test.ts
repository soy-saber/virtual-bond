import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { DatabaseStore } from '../src/main/database-core'

test('creates the latest schema and persists message states and settings', () => {
  const store = new DatabaseStore(':memory:')
  const character = store.getDefaultCharacter()
  assert.equal(character.id, 'makise-kurisu')
  assert.equal(character.name, '牧濑红莉栖')
  assert.deepEqual(store.getAppliedMigrationVersions(), [1, 2, 3])

  const userMessage = store.createMessage(character.id, 'user', '  晚上好  ')
  assert.equal(userMessage.content, '晚上好')
  assert.equal(userMessage.status, 'completed')

  const pending = store.createPendingCompanionMessage(character.id)
  assert.equal(pending.status, 'sending')
  const failed = store.updateCompanionMessage(pending.id, '说到一半', 'failed', '网络中断')
  assert.equal(failed.status, 'failed')
  assert.equal(failed.content, '说到一半')
  assert.equal(failed.error, '网络中断')

  store.setSetting('test.preference', { tone: 'quiet' })
  assert.deepEqual(store.getSetting('test.preference', null), { tone: 'quiet' })
  store.close()
})

test('migrates a legacy database and recovers interrupted replies', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'virtual-bond-test-'))
  const databasePath = join(temporaryRoot, 'legacy.db')
  const legacy = new Database(databasePath)
  const createdAt = '2026-01-01T00:00:00.000Z'
  legacy.exec(`
    CREATE TABLE characters (
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
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('companion', 'user')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
  legacy
    .prepare(`INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('legacy', '旧角色', '安静', '平和', createdAt, 1, 0, createdAt, createdAt)
  legacy
    .prepare('INSERT INTO conversations VALUES (?, ?, ?, ?, ?)')
    .run('legacy-message', 'legacy', 'user', '保留下来的旧消息', createdAt)
  legacy.close()

  let store = new DatabaseStore(databasePath)
  assert.deepEqual(store.getAppliedMigrationVersions(), [1, 2, 3])
  const migrated = store.listMessages('legacy')
  assert.equal(migrated.length, 1)
  assert.equal(migrated[0].status, 'completed')
  assert.equal(migrated[0].updatedAt, createdAt)
  const pending = store.createPendingCompanionMessage('legacy')
  store.close()

  store = new DatabaseStore(databasePath)
  const recovered = store.listMessages('legacy').find((message) => message.id === pending.id)
  assert.equal(recovered?.status, 'failed')
  assert.match(recovered?.error ?? '', /意外中断/)
  store.close()

  const resolvedRoot = resolve(temporaryRoot)
  assert.ok(resolvedRoot.startsWith(resolve(tmpdir())))
  rmSync(resolvedRoot, { recursive: true, force: true })
})

test('renames the legacy default character without losing conversation history', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'virtual-bond-character-rename-'))
  const databasePath = join(temporaryRoot, 'legacy-character.db')
  const legacy = new Database(databasePath)
  const createdAt = '2026-01-01T00:00:00.000Z'
  legacy.exec(`
    CREATE TABLE characters (
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
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('companion', 'user')),
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations VALUES (1, '${createdAt}'), (2, '${createdAt}');
  `)
  legacy
    .prepare('INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('chengxia', '澄夏', '正在窗边听雨', '安静而亲近', createdAt, 3, 58, createdAt, createdAt)
  legacy
    .prepare('INSERT INTO conversations VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      'legacy-greeting',
      'chengxia',
      'companion',
      '保留下来的对话',
      'completed',
      null,
      createdAt,
      createdAt
    )
  legacy.close()

  const store = new DatabaseStore(databasePath)
  const character = store.getDefaultCharacter()
  assert.equal(character.id, 'makise-kurisu')
  assert.equal(character.name, '牧濑红莉栖')
  assert.equal(character.bondLevel, 3)
  assert.equal(character.bondExperience, 58)
  assert.equal(store.listMessages(character.id)[0].content, '保留下来的对话')
  store.close()

  const resolvedRoot = resolve(temporaryRoot)
  assert.ok(resolvedRoot.startsWith(resolve(tmpdir())))
  rmSync(resolvedRoot, { recursive: true, force: true })
})
