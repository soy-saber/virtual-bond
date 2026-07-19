import { app, ipcMain, shell, type WebContents } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { describeProviderError, streamChatWithRetry } from './chat-provider'
import {
  createMessage,
  createPendingCompanionMessage,
  getDefaultCharacter,
  listMessages,
  updateCompanionMessage
} from './database'
import {
  clearProviderApiKey,
  exportProviderSettings,
  getProviderRuntimeSettings,
  getProviderSettings,
  importProviderSettingsFromCcswitch,
  importProviderSettingsFromText,
  resetProviderSettings,
  saveProviderSettings
} from './provider-settings'
import { scanSkins } from './skin-loader'

interface ActiveRequest {
  controller: AbortController
  senderId: number
}

const activeRequests = new Map<string, ActiveRequest>()

function requireShortString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${label}格式不正确`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label}不能为空`)
  if (normalized.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`)
  return normalized
}

function sendDelta(sender: WebContents, requestId: string, delta: string): void {
  if (!sender.isDestroyed()) sender.send('conversation:stream-delta', { requestId, delta })
}

export function registerApplicationIpc(): void {
  ipcMain.handle('character:get-default', () => getDefaultCharacter())
  ipcMain.handle('conversation:list', (_, rawCharacterId: unknown) => {
    const characterId = requireShortString(rawCharacterId, '角色 ID', 100)
    return listMessages(characterId)
  })
  ipcMain.handle(
    'conversation:send',
    async (event, rawRequestId: unknown, rawCharacterId: unknown, rawContent: unknown) => {
      const requestId = requireShortString(rawRequestId, '请求 ID', 100)
      const characterId = requireShortString(rawCharacterId, '角色 ID', 100)
      const content = requireShortString(rawContent, '消息', 8_000)
      if (activeRequests.has(requestId)) throw new Error('请求 ID 已在使用')

      const character = getDefaultCharacter()
      if (character.id !== characterId) throw new Error('角色不存在')
      const settings = getProviderRuntimeSettings({ autoImportCcswitch: true })
      const userMessage = createMessage(characterId, 'user', content)
      const contextMessages = listMessages(characterId, 40)
      const pendingMessage = createPendingCompanionMessage(characterId)
      const controller = new AbortController()
      activeRequests.set(requestId, { controller, senderId: event.sender.id })
      let responseText = ''

      try {
        await streamChatWithRetry({
          settings,
          character,
          messages: contextMessages,
          signal: controller.signal,
          onDelta: (delta) => {
            responseText += delta
            sendDelta(event.sender, requestId, delta)
          }
        })

        const completedText = responseText.trim()
        if (!completedText) throw new Error('模型没有返回可显示的文本')
        return {
          userMessage,
          companionMessage: updateCompanionMessage(pendingMessage.id, completedText, 'completed'),
          status: 'completed' as const
        }
      } catch (error) {
        if (controller.signal.aborted) {
          const partialText = responseText.trim()
          return {
            userMessage,
            companionMessage: updateCompanionMessage(pendingMessage.id, partialText, 'stopped'),
            status: 'stopped' as const
          }
        }
        const message = describeProviderError(error)
        return {
          userMessage,
          companionMessage: updateCompanionMessage(
            pendingMessage.id,
            responseText,
            'failed',
            message
          ),
          status: 'failed' as const,
          error: message
        }
      } finally {
        activeRequests.delete(requestId)
      }
    }
  )
  ipcMain.handle('conversation:stop', (event, rawRequestId: unknown) => {
    const requestId = requireShortString(rawRequestId, '请求 ID', 100)
    const active = activeRequests.get(requestId)
    if (!active || active.senderId !== event.sender.id) return false
    active.controller.abort()
    return true
  })
  ipcMain.handle('settings:get', () => getProviderSettings())
  ipcMain.handle('settings:save', (_, settings) => saveProviderSettings(settings))
  ipcMain.handle('settings:clear-api-key', () => clearProviderApiKey())
  ipcMain.handle('settings:reset', () => resetProviderSettings())
  ipcMain.handle('settings:export', () => exportProviderSettings())
  ipcMain.handle('settings:import-ccswitch', (_, preferredProvider: unknown) => {
    const provider =
      preferredProvider === 'openai' ||
      preferredProvider === 'anthropic' ||
      preferredProvider === 'gemini' ||
      preferredProvider === 'custom'
        ? preferredProvider
        : undefined
    return importProviderSettingsFromCcswitch(provider)
  })
  ipcMain.handle('settings:import-text', (_, text: string) => importProviderSettingsFromText(text))
  ipcMain.handle('skins:list', () => {
    const result = scanSkins([
      { directory: join(process.resourcesPath, 'skins'), source: 'builtin' },
      ...(app.isPackaged
        ? []
        : [
            {
              directory: join(app.getAppPath(), 'resources', 'skins'),
              source: 'development' as const
            }
          ]),
      { directory: join(app.getPath('userData'), 'skins'), source: 'user' }
    ])
    return {
      skins: result.skins.map(({ source, manifest }) => ({ source, manifest })),
      invalid: result.invalid.map(({ source, directory, error }) => ({
        source,
        directoryName: directory.split(/[\\/]/).pop() ?? '',
        error
      }))
    }
  })
  ipcMain.handle('skins:open-user-directory', async () => {
    const directory = join(app.getPath('userData'), 'skins')
    mkdirSync(directory, { recursive: true })
    const error = await shell.openPath(directory)
    if (error) throw new Error(error)
  })
}
