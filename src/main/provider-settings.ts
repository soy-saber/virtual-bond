import { app, safeStorage } from 'electron'
import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getSetting, setSetting } from './database'

export type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'custom'

export interface ProviderSettingsDraft {
  provider: ProviderKind
  name: string
  baseUrl: string
  model: string
  systemPrompt: string
}

export interface StoredProviderSettings extends ProviderSettingsDraft {
  source: string
  updatedAt: string
}

export interface ProviderSettingsView extends StoredProviderSettings {
  apiKeyPresent: boolean
  apiKeyHint: string
}

export interface ProviderRuntimeSettings extends StoredProviderSettings {
  apiKey: string
}

const SETTINGS_KEY = 'chat.provider.settings'
const SECRET_KEY = 'chat.provider.secret'

function now(): string {
  return new Date().toISOString()
}

function defaultProviderSettings(): StoredProviderSettings {
  return {
    provider: 'openai',
    name: '默认配置',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.6-luna',
    systemPrompt: '',
    source: 'default',
    updatedAt: now()
  }
}

function maskSecret(secret: string): string {
  const tail = secret.slice(-4)
  return tail ? `••••${tail}` : '已保存'
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
  if (!encoded) return payload
  if (prefix === 'plain') return Buffer.from(encoded, 'base64').toString('utf8')
  if (prefix === 'safe') return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  return payload
}

function loadStoredSecret(): string {
  const stored = getSetting<string>(SECRET_KEY, '')
  try {
    const secret = decodeSecret(stored)
    if (stored.startsWith('plain:') && secret && safeStorage.isEncryptionAvailable()) {
      setSetting(SECRET_KEY, encodeSecret(secret))
    }
    return secret
  } catch {
    return ''
  }
}

function saveStoredSecret(secret: string): void {
  setSetting(SECRET_KEY, encodeSecret(secret.trim()))
}

function isProviderKind(value: unknown): value is ProviderKind {
  return value === 'openai' || value === 'anthropic' || value === 'gemini' || value === 'custom'
}

function defaultBaseUrl(provider: ProviderKind): string {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1'
    case 'anthropic':
      return 'https://api.anthropic.com/v1'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta'
    case 'custom':
      return ''
  }
}

function normalizeSettings(input: Partial<ProviderSettingsDraft>): ProviderSettingsDraft {
  const provider = isProviderKind(input.provider) ? input.provider : 'openai'
  return {
    provider,
    name: input.name?.trim() || '默认配置',
    baseUrl: input.baseUrl?.trim().replace(/\/+$/, '') || defaultBaseUrl(provider),
    model: input.model?.trim() || '',
    systemPrompt: input.systemPrompt?.trim() || ''
  }
}

function validateSettings(settings: ProviderSettingsDraft): void {
  if (!settings.model) throw new Error('请填写模型名称')
  if (!settings.baseUrl) throw new Error('请填写 API 地址')
  let url: URL
  try {
    url = new URL(settings.baseUrl)
  } catch {
    throw new Error('API 地址格式不正确')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('API 地址仅支持 HTTP 或 HTTPS')
  }
}

function loadStoredSettings(): StoredProviderSettings {
  const stored = getSetting<StoredProviderSettings | null>(SETTINGS_KEY, null)
  return stored ?? defaultProviderSettings()
}

function saveStoredSettings(settings: StoredProviderSettings): void {
  setSetting(SETTINGS_KEY, settings)
}

function buildView(settings: StoredProviderSettings, secret: string): ProviderSettingsView {
  return {
    ...settings,
    apiKeyPresent: Boolean(secret),
    apiKeyHint: secret ? maskSecret(secret) : ''
  }
}

function parseJsonMaybe(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseTomlValue(text: string, key: string): string {
  const pattern = new RegExp(
    `^\\s*${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*=\\s*["']([^"']+)["']`,
    'm'
  )
  return pattern.exec(text)?.[1]?.trim() ?? ''
}

function parseDeepLinkProvider(
  text: string
): (Partial<ProviderSettingsDraft> & { apiKey?: string }) | null {
  const raw = text.trim()
  if (!raw.startsWith('ccswitch://')) return null

  const url = new URL(raw)
  if (!url.pathname.includes('/import')) return null

  const resource = url.searchParams.get('resource')
  if (resource !== 'provider') return null

  const appType = url.searchParams.get('app')?.toLowerCase() ?? 'custom'
  const provider: ProviderKind =
    appType === 'claude'
      ? 'anthropic'
      : appType === 'codex'
        ? 'openai'
        : appType === 'gemini'
          ? 'gemini'
          : 'custom'

  const configParam = url.searchParams.get('config')
  const configFormat = url.searchParams.get('configFormat')
  const decodedConfig = configParam && configParam.trim() ? decodeURIComponent(configParam) : ''
  const resolvedConfig = decodedConfig ? Buffer.from(decodedConfig, 'base64').toString('utf8') : ''
  const parsedConfig =
    resolvedConfig && configFormat === 'json'
      ? parseJsonMaybe(resolvedConfig)
      : resolvedConfig && configFormat === 'toml'
        ? resolvedConfig
        : null

  let baseUrl = url.searchParams.get('endpoint')?.split(',')[0]?.trim() ?? ''
  let model = url.searchParams.get('model')?.trim() ?? ''
  let apiKey = url.searchParams.get('apiKey')?.trim() ?? ''
  let systemPrompt = ''

  if (typeof parsedConfig === 'object' && parsedConfig && !Array.isArray(parsedConfig)) {
    const asRecord = parsedConfig as Record<string, unknown>
    const env = (asRecord.env as Record<string, unknown> | undefined) ?? {}
    const auth = (asRecord.auth as Record<string, unknown> | undefined) ?? {}
    baseUrl =
      baseUrl ||
      (typeof env.BASE_URL === 'string' ? env.BASE_URL : '') ||
      (typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : '') ||
      (typeof env.GOOGLE_GEMINI_BASE_URL === 'string' ? env.GOOGLE_GEMINI_BASE_URL : '')
    model =
      model ||
      (typeof env.MODEL === 'string' ? env.MODEL : '') ||
      (typeof env.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : '') ||
      (typeof env.GEMINI_MODEL === 'string' ? env.GEMINI_MODEL : '')
    apiKey =
      apiKey ||
      (typeof auth.OPENAI_API_KEY === 'string' ? auth.OPENAI_API_KEY : '') ||
      (typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY : '') ||
      (typeof env.ANTHROPIC_AUTH_TOKEN === 'string' ? env.ANTHROPIC_AUTH_TOKEN : '') ||
      (typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '') ||
      (typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY : '')
  } else if (typeof parsedConfig === 'string') {
    baseUrl = baseUrl || parseTomlValue(parsedConfig, 'base_url')
    model = model || parseTomlValue(parsedConfig, 'model')
    systemPrompt = parseTomlValue(parsedConfig, 'system_prompt')
  }

  return {
    provider,
    name: url.searchParams.get('name')?.trim() || '导入配置',
    baseUrl,
    model,
    systemPrompt,
    apiKey
  }
}

function loadProviderFromCcswitchDb(preferredProvider?: ProviderKind):
  | (Partial<ProviderSettingsDraft> & {
      apiKey?: string
      source: string
    })
  | null {
  const home = app.getPath('home')
  const settingsPath = join(home, '.cc-switch', 'settings.json')
  const dbPath = join(home, '.cc-switch', 'cc-switch.db')
  if (!existsSync(settingsPath) || !existsSync(dbPath)) return null

  const rawSettings = readFileSync(settingsPath, 'utf8')
  const settings = parseJsonMaybe(rawSettings) as Record<string, unknown> | null
  const currentIds = [
    settings?.currentProviderClaude,
    settings?.currentProviderCodex,
    settings?.currentProviderGemini
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => value.trim())

  const db = new Database(dbPath, { readonly: true })
  try {
    const rows = currentIds.length
      ? db
          .prepare(`SELECT * FROM providers WHERE id IN (${currentIds.map(() => '?').join(',')})`)
          .all(...currentIds)
      : db.prepare('SELECT * FROM providers WHERE is_current = 1 ORDER BY created_at DESC').all()

    const preferredAppType =
      preferredProvider === 'openai' || preferredProvider === 'custom'
        ? 'codex'
        : preferredProvider === 'anthropic'
          ? 'claude'
          : preferredProvider === 'gemini'
            ? 'gemini'
            : ''
    ;(rows as Array<Record<string, unknown>>).sort((left, right) => {
      const leftType = String(left.app_type ?? '').toLowerCase()
      const rightType = String(right.app_type ?? '').toLowerCase()
      const leftPreferred = leftType === preferredAppType ? 0 : 1
      const rightPreferred = rightType === preferredAppType ? 0 : 1
      if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred
      return currentIds.indexOf(String(left.id)) - currentIds.indexOf(String(right.id))
    })

    for (const row of rows as Array<Record<string, unknown>>) {
      const appType = String(row.app_type ?? '').toLowerCase()
      const settingsConfig =
        typeof row.settings_config === 'string'
          ? (parseJsonMaybe(row.settings_config) as Record<string, unknown> | null)
          : (row.settings_config as Record<string, unknown> | null)

      if (!settingsConfig) continue

      if (appType === 'claude' || appType === 'claude-desktop') {
        const env = (settingsConfig.env as Record<string, unknown> | undefined) ?? {}
        return {
          provider: 'anthropic',
          name: String(row.name ?? 'CCSwitch Claude'),
          baseUrl:
            (typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : '') ||
            (typeof env.BASE_URL === 'string' ? env.BASE_URL : ''),
          model:
            (typeof env.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : '') ||
            (typeof env.ANTHROPIC_DEFAULT_SONNET_MODEL === 'string'
              ? env.ANTHROPIC_DEFAULT_SONNET_MODEL
              : '') ||
            (typeof env.ANTHROPIC_DEFAULT_OPUS_MODEL === 'string'
              ? env.ANTHROPIC_DEFAULT_OPUS_MODEL
              : ''),
          systemPrompt: '',
          apiKey:
            (typeof env.ANTHROPIC_AUTH_TOKEN === 'string' ? env.ANTHROPIC_AUTH_TOKEN : '') ||
            (typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : ''),
          source: 'ccswitch-db:claude'
        }
      }

      if (appType === 'codex') {
        const auth = (settingsConfig.auth as Record<string, unknown> | undefined) ?? {}
        const configText = typeof settingsConfig.config === 'string' ? settingsConfig.config : ''
        const authPath = join(home, '.codex', 'auth.json')
        const liveAuth = existsSync(authPath)
          ? (parseJsonMaybe(readFileSync(authPath, 'utf8')) as Record<string, unknown> | null)
          : null
        return {
          provider: 'openai',
          name: String(row.name ?? 'CCSwitch Codex'),
          baseUrl:
            parseTomlValue(configText, 'base_url') || parseTomlValue(configText, 'api_base') || '',
          model:
            parseTomlValue(configText, 'model') ||
            parseTomlValue(configText, 'default_model') ||
            '',
          systemPrompt: '',
          apiKey:
            (typeof auth.OPENAI_API_KEY === 'string' ? auth.OPENAI_API_KEY : '') ||
            (typeof auth.experimental_bearer_token === 'string'
              ? auth.experimental_bearer_token
              : '') ||
            (typeof liveAuth?.OPENAI_API_KEY === 'string' ? liveAuth.OPENAI_API_KEY : ''),
          source: 'ccswitch-db:codex'
        }
      }

      if (appType === 'gemini') {
        const env = (settingsConfig.env as Record<string, unknown> | undefined) ?? {}
        return {
          provider: 'gemini',
          name: String(row.name ?? 'CCSwitch Gemini'),
          baseUrl:
            (typeof env.GOOGLE_GEMINI_BASE_URL === 'string' ? env.GOOGLE_GEMINI_BASE_URL : '') ||
            '',
          model: (typeof env.GEMINI_MODEL === 'string' ? env.GEMINI_MODEL : '') || '',
          systemPrompt: '',
          apiKey:
            (typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY : '') ||
            (typeof env.GOOGLE_GEMINI_API_KEY === 'string' ? env.GOOGLE_GEMINI_API_KEY : ''),
          source: 'ccswitch-db:gemini'
        }
      }
    }
    return null
  } finally {
    db.close()
  }
}

function applyImportedSettings(
  imported: Partial<ProviderSettingsDraft> & { apiKey?: string; source: string }
): ProviderSettingsView {
  const existing = loadStoredSettings()
  const normalized = normalizeSettings(imported)
  const next: StoredProviderSettings = {
    ...existing,
    ...normalized,
    source: imported.source,
    updatedAt: now()
  }
  saveStoredSettings(next)
  if (typeof imported.apiKey === 'string') {
    saveStoredSecret(imported.apiKey)
  }
  return buildView(next, loadStoredSecret())
}

export function getProviderSettings(): ProviderSettingsView {
  const stored = loadStoredSettings()
  const secret = loadStoredSecret()
  return buildView(stored, secret)
}

export function saveProviderSettings(
  input: Partial<ProviderSettingsDraft> & { apiKey?: string }
): ProviderSettingsView {
  const existing = loadStoredSettings()
  const normalized = normalizeSettings(input)
  validateSettings(normalized)
  const next: StoredProviderSettings = {
    ...existing,
    ...normalized,
    source: 'manual',
    updatedAt: now()
  }
  saveStoredSettings(next)
  if (Object.prototype.hasOwnProperty.call(input, 'apiKey')) {
    saveStoredSecret(input.apiKey ?? '')
  }
  return buildView(next, loadStoredSecret())
}

export function clearProviderApiKey(): ProviderSettingsView {
  saveStoredSecret('')
  return getProviderSettings()
}

export function resetProviderSettings(): ProviderSettingsView {
  saveStoredSecret('')
  const next = defaultProviderSettings()
  saveStoredSettings(next)
  return buildView(next, '')
}

export function exportProviderSettings(): string {
  const current = getProviderSettings()
  return JSON.stringify(current, null, 2)
}

export function importProviderSettingsFromText(text: string): ProviderSettingsView {
  const raw = text.trim()
  if (!raw) throw new Error('导入内容为空')

  const deepLink = parseDeepLinkProvider(raw)
  if (deepLink) {
    return applyImportedSettings({ ...deepLink, source: 'ccswitch-link' })
  }

  const parsed = parseJsonMaybe(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    if ('settings_config' in record || 'app_type' in record) {
      const settingsConfig =
        typeof record.settings_config === 'string'
          ? (parseJsonMaybe(record.settings_config) as Record<string, unknown> | null)
          : (record.settings_config as Record<string, unknown> | null)
      if (settingsConfig) {
        const appType = String(record.app_type ?? '').toLowerCase()
        const env = (settingsConfig.env as Record<string, unknown> | undefined) ?? {}
        if (appType === 'claude' || appType === 'claude-desktop') {
          return applyImportedSettings({
            provider: 'anthropic',
            name: String(record.name ?? '导入配置'),
            baseUrl:
              (typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : '') ||
              (typeof env.BASE_URL === 'string' ? env.BASE_URL : ''),
            model:
              (typeof env.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : '') ||
              (typeof env.ANTHROPIC_DEFAULT_SONNET_MODEL === 'string'
                ? env.ANTHROPIC_DEFAULT_SONNET_MODEL
                : ''),
            systemPrompt: '',
            apiKey:
              (typeof env.ANTHROPIC_AUTH_TOKEN === 'string' ? env.ANTHROPIC_AUTH_TOKEN : '') ||
              (typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : ''),
            source: 'clipboard:ccswitch-json'
          })
        }

        if (appType === 'codex') {
          const auth = (settingsConfig.auth as Record<string, unknown> | undefined) ?? {}
          const configText = typeof settingsConfig.config === 'string' ? settingsConfig.config : ''
          return applyImportedSettings({
            provider: 'openai',
            name: String(record.name ?? 'CCSwitch Codex'),
            baseUrl:
              parseTomlValue(configText, 'base_url') ||
              parseTomlValue(configText, 'api_base') ||
              '',
            model:
              parseTomlValue(configText, 'model') ||
              parseTomlValue(configText, 'default_model') ||
              '',
            systemPrompt: '',
            apiKey:
              (typeof auth.OPENAI_API_KEY === 'string' ? auth.OPENAI_API_KEY : '') ||
              (typeof auth.experimental_bearer_token === 'string'
                ? auth.experimental_bearer_token
                : ''),
            source: 'clipboard:ccswitch-json'
          })
        }

        if (appType === 'gemini') {
          return applyImportedSettings({
            provider: 'gemini',
            name: String(record.name ?? 'CCSwitch Gemini'),
            baseUrl:
              typeof env.GOOGLE_GEMINI_BASE_URL === 'string' ? env.GOOGLE_GEMINI_BASE_URL : '',
            model: typeof env.GEMINI_MODEL === 'string' ? env.GEMINI_MODEL : '',
            systemPrompt: '',
            apiKey:
              (typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY : '') ||
              (typeof env.GOOGLE_GEMINI_API_KEY === 'string' ? env.GOOGLE_GEMINI_API_KEY : ''),
            source: 'clipboard:ccswitch-json'
          })
        }
      }
    }

    if (
      typeof record.provider === 'string' &&
      typeof record.baseUrl === 'string' &&
      typeof record.model === 'string'
    ) {
      return applyImportedSettings({
        provider: isProviderKind(record.provider) ? record.provider : 'custom',
        name: typeof record.name === 'string' ? record.name : '导入配置',
        baseUrl: record.baseUrl,
        model: record.model,
        systemPrompt: typeof record.systemPrompt === 'string' ? record.systemPrompt : '',
        apiKey: typeof record.apiKey === 'string' ? record.apiKey : undefined,
        source: 'clipboard:json'
      })
    }
  }

  const imported = parseDeepLinkProvider(raw)
  if (imported) {
    return applyImportedSettings({ ...imported, source: 'ccswitch-link' })
  }

  throw new Error('无法识别的配置格式')
}

export function importProviderSettingsFromCcswitch(
  preferredProvider?: ProviderKind
): ProviderSettingsView {
  const imported = loadProviderFromCcswitchDb(preferredProvider)
  if (!imported) throw new Error('未找到可导入的 CCSwitch 配置')
  return applyImportedSettings(imported)
}

export function getProviderRuntimeSettings(options?: {
  autoImportCcswitch?: boolean
}): ProviderRuntimeSettings {
  let settings = loadStoredSettings()
  let apiKey = loadStoredSecret()

  if (!apiKey && options?.autoImportCcswitch) {
    const imported = loadProviderFromCcswitchDb(settings.provider)
    if (imported?.apiKey) {
      const view = applyImportedSettings(imported)
      settings = view
      apiKey = loadStoredSecret()
    }
  }

  validateSettings(settings)
  if (!apiKey) {
    throw new Error('尚未配置 API Key，请在设置中填写或从 CCSwitch 导入')
  }
  return { ...settings, apiKey }
}
