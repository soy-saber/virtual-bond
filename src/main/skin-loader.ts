import { existsSync, readFileSync, readdirSync, type Dirent } from 'fs'
import { isAbsolute, relative, resolve } from 'path'

export interface SkinAnimation {
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

export interface SkinManifest {
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
  animations: Record<string, SkinAnimation>
}

export interface LoadedSkin {
  directory: string
  source: 'builtin' | 'user' | 'development'
  manifest: SkinManifest
}

export interface InvalidSkin {
  directory: string
  source: LoadedSkin['source']
  error: string
}

export interface SkinScanResult {
  skins: LoadedSkin[]
  invalid: InvalidSkin[]
}

export interface SkinSelectionResult {
  selectedSkinId: string
  requestedSkinId: string
  selectionRecovered: boolean
}

interface SkinRoot {
  directory: string
  source: LoadedSkin['source']
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
  return value.trim()
}

function requirePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}必须是正数`)
  }
  return value
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}必须是有限数值`)
  }
  return value
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  const numeric = requireFiniteNumber(value, label)
  if (numeric < 0) throw new Error(`${label}不能小于 0`)
  return numeric
}

function requirePositiveInteger(value: unknown, label: string): number {
  const numeric = requirePositiveNumber(value, label)
  if (!Number.isInteger(numeric)) throw new Error(`${label}必须是整数`)
  return numeric
}

function resolveAsset(skinDirectory: string, file: string): string {
  if (isAbsolute(file)) throw new Error('动画文件必须使用皮肤目录内的相对路径')
  const resolvedRoot = resolve(skinDirectory)
  const resolvedFile = resolve(resolvedRoot, file)
  const relativePath = relative(resolvedRoot, resolvedFile)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('动画文件路径超出皮肤目录')
  }
  if (!existsSync(resolvedFile)) throw new Error(`动画文件不存在：${file}`)
  return file.replace(/\\/g, '/')
}

export function loadSkinManifest(skinDirectory: string): SkinManifest {
  const manifestPath = resolve(skinDirectory, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error('缺少 manifest.json')

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    throw new Error('manifest.json 不是有效 JSON')
  }

  const record = requireRecord(raw, 'manifest')
  const canvas = requireRecord(record.canvas, 'canvas')
  const anchor = requireRecord(canvas.anchor, 'canvas.anchor')
  const animationRecords = requireRecord(record.animations, 'animations')
  const animations: Record<string, SkinAnimation> = {}

  for (const [rawName, rawAnimation] of Object.entries(animationRecords)) {
    const name = rawName.trim()
    if (!name) throw new Error('动作名称不能为空')
    const animation = requireRecord(rawAnimation, `animations.${name}`)
    const frames = requirePositiveInteger(animation.frames, `animations.${name}.frames`)
    const columns = requirePositiveInteger(
      animation.columns ?? frames,
      `animations.${name}.columns`
    )
    const rows = requirePositiveInteger(animation.rows ?? 1, `animations.${name}.rows`)
    if (columns * rows < frames) {
      throw new Error(`animations.${name}的网格容量小于帧数`)
    }
    animations[name] = {
      file: resolveAsset(skinDirectory, requireString(animation.file, `animations.${name}.file`)),
      frameWidth: requirePositiveNumber(animation.frameWidth, `animations.${name}.frameWidth`),
      frameHeight: requirePositiveNumber(animation.frameHeight, `animations.${name}.frameHeight`),
      frames,
      columns,
      rows,
      margin: requireNonNegativeNumber(animation.margin ?? 0, `animations.${name}.margin`),
      spacing: requireNonNegativeNumber(animation.spacing ?? 0, `animations.${name}.spacing`),
      fps: requirePositiveNumber(animation.fps, `animations.${name}.fps`),
      loop: animation.loop !== false,
      ...(typeof animation.next === 'string' && animation.next.trim()
        ? { next: animation.next.trim() }
        : {})
    }
  }
  if (!animations.idle) throw new Error('皮肤必须提供 idle 动作')

  const hitboxRecord = canvas.hitbox ? requireRecord(canvas.hitbox, 'canvas.hitbox') : null
  return {
    id: requireString(record.id, 'id'),
    name: requireString(record.name, 'name'),
    version: requirePositiveNumber(record.version, 'version'),
    canvas: {
      width: requirePositiveNumber(canvas.width, 'canvas.width'),
      height: requirePositiveNumber(canvas.height, 'canvas.height'),
      anchor: {
        x: requireFiniteNumber(anchor.x, 'canvas.anchor.x'),
        y: requireFiniteNumber(anchor.y, 'canvas.anchor.y')
      },
      ...(hitboxRecord
        ? {
            hitbox: {
              x: requireFiniteNumber(hitboxRecord.x ?? 0, 'canvas.hitbox.x'),
              y: requireFiniteNumber(hitboxRecord.y ?? 0, 'canvas.hitbox.y'),
              width: requirePositiveNumber(hitboxRecord.width, 'canvas.hitbox.width'),
              height: requirePositiveNumber(hitboxRecord.height, 'canvas.hitbox.height')
            }
          }
        : {})
    },
    flipHorizontal: record.flipHorizontal !== false,
    animations
  }
}

export function scanSkins(roots: SkinRoot[]): SkinScanResult {
  const byId = new Map<string, LoadedSkin>()
  const invalid: InvalidSkin[] = []

  for (const root of roots) {
    if (!existsSync(root.directory)) continue
    let entries: Dirent[]
    try {
      entries = readdirSync(root.directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))
    } catch (error) {
      invalid.push({
        directory: root.directory,
        source: root.source,
        error: `无法读取皮肤目录：${error instanceof Error ? error.message : '未知错误'}`
      })
      continue
    }
    for (const entry of entries) {
      const directory = resolve(root.directory, entry.name)
      try {
        const manifest = loadSkinManifest(directory)
        byId.set(manifest.id, { directory, source: root.source, manifest })
      } catch (error) {
        invalid.push({
          directory,
          source: root.source,
          error: error instanceof Error ? error.message : '未知皮肤错误'
        })
      }
    }
  }

  return {
    skins: [...byId.values()].sort((left, right) =>
      left.manifest.name.localeCompare(right.manifest.name)
    ),
    invalid
  }
}

export function resolveSkinSelection(
  result: SkinScanResult,
  requestedSkinId: unknown
): SkinSelectionResult {
  const requested = typeof requestedSkinId === 'string' ? requestedSkinId.trim() : ''
  const selected = result.skins.find((skin) => skin.manifest.id === requested) ?? result.skins[0]
  const selectedSkinId = selected?.manifest.id ?? ''
  return {
    selectedSkinId,
    requestedSkinId: requested,
    selectionRecovered: Boolean(requested && requested !== selectedSkinId)
  }
}
