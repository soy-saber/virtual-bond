import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadSkinManifest, resolveSkinSelection, scanSkins } from '../src/main/skin-loader'

function createSkin(
  root: string,
  directoryName: string,
  manifest: Record<string, unknown>
): string {
  const directory = join(root, directoryName)
  mkdirSync(join(directory, 'animations'), { recursive: true })
  writeFileSync(join(directory, 'animations', 'idle.png'), 'placeholder')
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest))
  return directory
}

function validManifest(id = 'test-skin'): Record<string, unknown> {
  return {
    id,
    name: '测试皮肤',
    version: 1,
    canvas: { width: 256, height: 256, anchor: { x: 128, y: 240 } },
    animations: {
      idle: {
        file: 'animations/idle.png',
        frameWidth: 256,
        frameHeight: 256,
        frames: 8,
        fps: 8,
        loop: true
      }
    }
  }
}

test('loads an open-ended skin manifest with idle animation', () => {
  const root = mkdtempSync(join(tmpdir(), 'virtual-bond-skin-'))
  try {
    const directory = createSkin(root, 'valid', validManifest())
    const manifest = loadSkinManifest(directory)
    assert.equal(manifest.id, 'test-skin')
    assert.equal(manifest.animations.idle.frames, 8)
    assert.equal(manifest.animations.idle.columns, 8)
    assert.equal(manifest.animations.idle.rows, 1)
    assert.equal(manifest.flipHorizontal, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('accepts a multi-row generation grid and rejects insufficient capacity', () => {
  const root = mkdtempSync(join(tmpdir(), 'virtual-bond-skin-'))
  try {
    const gridManifest = validManifest()
    const idle = (gridManifest.animations as Record<string, Record<string, unknown>>).idle
    idle.columns = 4
    idle.rows = 2
    idle.margin = 2
    idle.spacing = 1
    const directory = createSkin(root, 'grid', gridManifest)
    const animation = loadSkinManifest(directory).animations.idle
    assert.deepEqual(
      {
        columns: animation.columns,
        rows: animation.rows,
        margin: animation.margin,
        spacing: animation.spacing
      },
      { columns: 4, rows: 2, margin: 2, spacing: 1 }
    )

    idle.rows = 1
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(gridManifest))
    assert.throws(() => loadSkinManifest(directory), /网格容量小于帧数/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects missing idle and paths outside the skin directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'virtual-bond-skin-'))
  try {
    const missingIdle = validManifest()
    missingIdle.animations = {}
    const missingDirectory = createSkin(root, 'missing-idle', missingIdle)
    assert.throws(() => loadSkinManifest(missingDirectory), /idle/)

    const escaped = validManifest()
    ;(escaped.animations as Record<string, Record<string, unknown>>).idle.file = '../secret.png'
    const escapedDirectory = createSkin(root, 'escaped', escaped)
    assert.throws(() => loadSkinManifest(escapedDirectory), /超出皮肤目录/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('lets later user roots override a built-in skin with the same id', () => {
  const root = mkdtempSync(join(tmpdir(), 'virtual-bond-skin-'))
  try {
    const builtin = join(root, 'builtin')
    const user = join(root, 'user')
    createSkin(builtin, 'default', { ...validManifest('shared'), name: '内置皮肤' })
    createSkin(user, 'replacement', { ...validManifest('shared'), name: '用户皮肤' })
    const result = scanSkins([
      { directory: builtin, source: 'builtin' },
      { directory: user, source: 'user' }
    ])
    assert.equal(result.skins.length, 1)
    assert.equal(result.skins[0].manifest.name, '用户皮肤')
    assert.equal(result.skins[0].source, 'user')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('keeps a valid selected skin and recovers a removed selection', () => {
  const root = mkdtempSync(join(tmpdir(), 'virtual-bond-skin-'))
  try {
    createSkin(root, 'alpha', { ...validManifest('alpha'), name: 'Alpha' })
    createSkin(root, 'beta', { ...validManifest('beta'), name: 'Beta' })
    const result = scanSkins([{ directory: root, source: 'user' }])

    assert.deepEqual(resolveSkinSelection(result, 'beta'), {
      selectedSkinId: 'beta',
      requestedSkinId: 'beta',
      selectionRecovered: false
    })
    assert.deepEqual(resolveSkinSelection(result, 'removed'), {
      selectedSkinId: 'alpha',
      requestedSkinId: 'removed',
      selectionRecovered: true
    })
    assert.deepEqual(resolveSkinSelection({ skins: [], invalid: [] }, 'removed'), {
      selectedSkinId: '',
      requestedSkinId: 'removed',
      selectionRecovered: true
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reports an unreadable skin root without aborting other roots', () => {
  const root = mkdtempSync(join(tmpdir(), 'virtual-bond-skin-'))
  try {
    const invalidRoot = join(root, 'not-a-directory')
    const validRoot = join(root, 'valid-root')
    writeFileSync(invalidRoot, 'file')
    createSkin(validRoot, 'valid', validManifest())

    const result = scanSkins([
      { directory: invalidRoot, source: 'user' },
      { directory: validRoot, source: 'builtin' }
    ])
    assert.equal(result.skins.length, 1)
    assert.equal(result.invalid.length, 1)
    assert.match(result.invalid[0].error, /无法读取皮肤目录/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
