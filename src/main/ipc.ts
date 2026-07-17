import { ipcMain } from 'electron'
import { createDemoReply, createMessage, getDefaultCharacter, listMessages } from './database'

export function registerApplicationIpc(): void {
  ipcMain.handle('character:get-default', () => getDefaultCharacter())
  ipcMain.handle('conversation:list', (_, characterId: string) => listMessages(characterId))
  ipcMain.handle('conversation:send', async (_, characterId: string, content: string) => {
    const userMessage = createMessage(characterId, 'user', content)
    const companionMessage = createDemoReply(characterId)
    return { userMessage, companionMessage }
  })
}
