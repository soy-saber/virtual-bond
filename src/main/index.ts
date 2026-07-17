import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  shell,
  Tray,
  type Rectangle
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { closeDatabase, getSetting, initializeDatabase, setSetting } from './database'
import { registerApplicationIpc } from './ipc'

type WindowMode = 'pet' | 'room'

const PET_SIZE = { width: 360, height: 440 }
const ROOM_SIZE = { width: 1180, height: 760 }
const POSITION_SETTING = 'window.petBounds'

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let currentMode: WindowMode = 'pet'
let isQuitting = false
let savePositionTimer: NodeJS.Timeout | undefined
let petBounds: Rectangle | undefined
let dragOrigin: { mouseX: number; mouseY: number; windowX: number; windowY: number } | undefined

function defaultPetBounds(): Rectangle {
  const workArea = screen.getPrimaryDisplay().workArea
  return {
    x: workArea.x + workArea.width - PET_SIZE.width - 32,
    y: workArea.y + workArea.height - PET_SIZE.height - 24,
    ...PET_SIZE
  }
}

function isVisibleOnAnyDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapWidth =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x)
    const overlapHeight =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y)
    return overlapWidth >= 80 && overlapHeight >= 80
  })
}

function restorePetBounds(): Rectangle {
  const stored = getSetting<Rectangle | null>(POSITION_SETTING, null)
  if (!stored) return defaultPetBounds()
  const normalized = { ...stored, ...PET_SIZE }
  return isVisibleOnAnyDisplay(normalized) ? normalized : defaultPetBounds()
}

function persistPetBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed() || currentMode !== 'pet') return
  petBounds = { ...mainWindow.getBounds(), ...PET_SIZE }
  setSetting(POSITION_SETTING, petBounds)
}

function schedulePetBoundsSave(): void {
  if (currentMode !== 'pet') return
  if (savePositionTimer) clearTimeout(savePositionTimer)
  savePositionTimer = setTimeout(persistPetBounds, 250)
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.show()
  mainWindow.focus()
}

function toggleWindowVisibility(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.isVisible() ? mainWindow.hide() : showWindow()
}

function requestRoomOpen(): void {
  showWindow()
  mainWindow?.webContents.send('app:open-room')
}

function sendPetGreeting(): void {
  showWindow()
  mainWindow?.webContents.send('pet:say', '我在。刚刚好像听见你叫我了。')
}

function setWindowMode(window: BrowserWindow, mode: WindowMode): void {
  if (mode === currentMode) return

  if (mode === 'room') {
    persistPetBounds()
    currentMode = 'room'
    window.setResizable(true)
    window.setSkipTaskbar(false)
    window.setMinimumSize(920, 640)
    window.setSize(ROOM_SIZE.width, ROOM_SIZE.height, true)
    window.center()
    return
  }

  currentMode = 'pet'
  window.unmaximize()
  window.setMinimumSize(320, 360)
  window.setResizable(false)
  window.setSkipTaskbar(true)
  window.setBounds(petBounds ?? restorePetBounds(), true)
  window.setAlwaysOnTop(true)
}

function createContextMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: '打个招呼', click: sendPetGreeting },
    { label: '进入陪伴空间', click: requestRoomOpen },
    { type: 'separator' },
    {
      label: '始终置顶',
      type: 'checkbox',
      checked: mainWindow?.isAlwaysOnTop() ?? true,
      click: (item) => mainWindow?.setAlwaysOnTop(item.checked)
    },
    { label: '隐藏桌宠', click: () => mainWindow?.hide() },
    { type: 'separator' },
    {
      label: '退出 Virtual Bond',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
}

function createWindow(): BrowserWindow {
  petBounds = restorePetBounds()
  const window = new BrowserWindow({
    ...petBounds,
    minWidth: 320,
    minHeight: 360,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())
  window.on('move', schedulePetBoundsSave)
  window.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    window.hide()
  })
  window.webContents.on('context-menu', () => createContextMenu().popup({ window }))
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

function createTray(): void {
  tray = new Tray(icon)
  tray.setToolTip('Virtual Bond · 澄夏在这里')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 / 隐藏桌宠', click: toggleWindowVisibility },
      { label: '进入陪伴空间', click: requestRoomOpen },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', toggleWindowVisibility)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return
  initializeDatabase()
  registerApplicationIpc()
  electronApp.setAppUserModelId('com.soysaber.virtualbond')

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.handle('window:minimize', (event) =>
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  )
  ipcMain.handle('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false
    window.isMaximized() ? window.unmaximize() : window.maximize()
    return window.isMaximized()
  })
  ipcMain.handle('window:set-mode', (event, mode: WindowMode) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) setWindowMode(window, mode)
  })
  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.hide())
  ipcMain.on('window:show-context-menu', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) createContextMenu().popup({ window })
  })
  ipcMain.on('window:drag-start', (event, mouseX: number, mouseY: number) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || currentMode !== 'pet') return
    const [windowX, windowY] = window.getPosition()
    dragOrigin = { mouseX, mouseY, windowX, windowY }
  })
  ipcMain.on('window:drag-move', (event, mouseX: number, mouseY: number) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || !dragOrigin || currentMode !== 'pet') return
    window.setPosition(
      Math.round(dragOrigin.windowX + mouseX - dragOrigin.mouseX),
      Math.round(dragOrigin.windowY + mouseY - dragOrigin.mouseY)
    )
  })
  ipcMain.on('window:drag-end', () => {
    dragOrigin = undefined
    schedulePetBoundsSave()
  })

  mainWindow = createWindow()
  createTray()
  globalShortcut.register('CommandOrControl+Shift+B', toggleWindowVisibility)

  app.on('activate', showWindow)
  app.on('second-instance', showWindow)
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin' && isQuitting) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  persistPetBounds()
  globalShortcut.unregisterAll()
  closeDatabase()
})
