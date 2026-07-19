import { app, safeStorage } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getSetting, setSetting } from './database'
import {
  decodeImageResponse,
  normalizeImageRequest,
  type ImageRequest,
  type ImageResponsePayload
} from './image-provider-core'

export interface ImageProviderSettingsDraft {
  name: string
  baseUrl: string
  model: string
  apiKey?: string
}

export interface ImageReference {
  name: string
  mimeType: string
  bytes: Uint8Array
}

interface StoredImageProviderSettings extends Omit<ImageProviderSettingsDraft, 'apiKey'> {
  source: string
  updatedAt: string
}

export interface ImageProviderSettingsView extends StoredImageProviderSettings {
  apiKeyPresent: boolean
  apiKeyHint: string
}

const SETTINGS_KEY = 'image.provider.settings'
const SECRET_KEY = 'image.provider.secret'
const LOCAL_SOURCE = 'local-wisart-key'
const DEFAULT_BASE_URL = 'https://wisart.kuaileshifu.com/v1'
const DEFAULT_MODEL = 'gpt-image-2'

function now(): string {
  return new Date().toISOString()
}

function defaultSettings(): StoredImageProviderSettings {
  return {
    name: 'WisArt GPT Image 2',
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    source: 'default',
    updatedAt: now()
  }
}

function encodeSecret(secret: string): string {
  if (!secret) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统无法使用安全存储，请先启用系统密钥服务')
  }
  return `safe:${safeStorage.encryptString(secret).toString('base64')}`
}

function decodeSecret(payload: string): string {
  if (!payload) return ''
  const [prefix, encoded] = payload.split(':', 2)
  if (prefix !== 'safe' || !encoded) return ''
  return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
}

function loadSecret(): string {
  try {
    return decodeSecret(getSetting<string>(SECRET_KEY, ''))
  } catch {
    return ''
  }
}

function saveSecret(secret: string): void {
  setSetting(SECRET_KEY, encodeSecret(secret.trim()))
}

function validateBaseUrl(raw: string): string {
  const normalized = raw.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error('图片 API 地址格式不正确')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('图片 API 地址仅支持 HTTP 或 HTTPS')
  }
  return normalized
}

function applyLocalDefault(settings: StoredImageProviderSettings): StoredImageProviderSettings {
  if (settings.source !== 'default' && settings.source !== LOCAL_SOURCE) return settings
  const keyPath = join(app.getPath('desktop'), 'key.txt')
  if (!existsSync(keyPath)) return settings
  const apiKey = readFileSync(keyPath, 'utf8').split(/\r?\n/, 1)[0].trim()
  if (!apiKey) return settings
  const next: StoredImageProviderSettings = {
    name: 'WisArt GPT Image 2',
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    source: LOCAL_SOURCE,
    updatedAt: now()
  }
  setSetting(SETTINGS_KEY, next)
  saveSecret(apiKey)
  return next
}

function loadSettings(): StoredImageProviderSettings {
  return applyLocalDefault(getSetting<StoredImageProviderSettings>(SETTINGS_KEY, defaultSettings()))
}

function buildView(
  settings: StoredImageProviderSettings,
  secret: string
): ImageProviderSettingsView {
  return {
    ...settings,
    apiKeyPresent: Boolean(secret),
    apiKeyHint: secret ? `••••${secret.slice(-4)}` : ''
  }
}

export function getImageProviderSettings(): ImageProviderSettingsView {
  const settings = loadSettings()
  return buildView(settings, loadSecret())
}

export function saveImageProviderSettings(
  input: Partial<ImageProviderSettingsDraft>
): ImageProviderSettingsView {
  const current = loadSettings()
  const next: StoredImageProviderSettings = {
    name: input.name?.trim() || current.name,
    baseUrl: validateBaseUrl(input.baseUrl ?? current.baseUrl),
    model: input.model?.trim() || current.model,
    source: 'manual',
    updatedAt: now()
  }
  setSetting(SETTINGS_KEY, next)
  if (Object.prototype.hasOwnProperty.call(input, 'apiKey')) saveSecret(input.apiKey ?? '')
  return buildView(next, loadSecret())
}

export function clearImageProviderApiKey(): ImageProviderSettingsView {
  saveSecret('')
  const current = loadSettings()
  const settings = { ...current, source: 'manual', updatedAt: now() }
  setSetting(SETTINGS_KEY, settings)
  return buildView(settings, '')
}

async function readError(response: Response): Promise<string> {
  const text = (await response.text()).slice(0, 2_000)
  return text || response.statusText || '未知错误'
}

async function downloadImage(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`图片下载失败（${response.status}）`)
  return new Uint8Array(await response.arrayBuffer())
}

export async function generateImages(request: ImageRequest): Promise<Uint8Array[]> {
  const settings = loadSettings()
  const apiKey = loadSecret()
  if (!apiKey) throw new Error('请先配置图片生成 API Key')
  const normalized = normalizeImageRequest(request)
  const response = await fetch(`${settings.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.model,
      ...normalized,
      response_format: 'b64_json'
    }),
    signal: AbortSignal.timeout(300_000)
  })
  if (!response.ok) {
    throw new Error(`图片生成失败（${response.status}）：${await readError(response)}`)
  }
  return decodeImageResponse((await response.json()) as ImageResponsePayload, downloadImage)
}

export async function editImages(
  request: ImageRequest,
  references: ImageReference[]
): Promise<Uint8Array[]> {
  if (references.length < 1 || references.length > 16) {
    throw new Error('参考图数量必须是 1 到 16')
  }
  const settings = loadSettings()
  const apiKey = loadSecret()
  if (!apiKey) throw new Error('请先配置图片生成 API Key')
  const normalized = normalizeImageRequest(request)
  const form = new FormData()
  form.set('model', settings.model)
  form.set('prompt', normalized.prompt)
  form.set('size', normalized.size)
  form.set('quality', normalized.quality)
  form.set('n', String(normalized.n))
  form.set('response_format', 'b64_json')
  references.forEach((reference) => {
    if (reference.bytes.byteLength > 50 * 1024 * 1024) throw new Error('单张参考图不能超过 50MB')
    form.append(
      'image',
      new Blob([new Uint8Array(reference.bytes).buffer], { type: reference.mimeType }),
      reference.name
    )
  })
  const response = await fetch(`${settings.baseUrl}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(300_000)
  })
  if (!response.ok) {
    throw new Error(`图片编辑失败（${response.status}）：${await readError(response)}`)
  }
  return decodeImageResponse((await response.json()) as ImageResponsePayload, downloadImage)
}
