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

const PET_BASE_SIZE = { width: 360, height: 440 }
const ROOM_SIZE = { width: 1180, height: 760 }
const POSITION_SETTING = 'window.petBounds'
const SCALE_SETTING = 'window.petScale'
const DEFAULT_PET_SCALE = 0.75
const MIN_PET_SCALE = 0.45
const MAX_PET_SCALE = 2.4

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let currentMode: WindowMode = 'pet'
let isQuitting = false
let savePositionTimer: NodeJS.Timeout | undefined
let petBounds: Rectangle | undefined
let petScale = DEFAULT_PET_SCALE
let dragOrigin: { mouseX: number; mouseY: number; windowX: number; windowY: number } | undefined

function normalizePetScale(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_PET_SCALE
  return Math.round(Math.min(MAX_PET_SCALE, Math.max(MIN_PET_SCALE, numeric)) * 20) / 20
}

function getPetSize(): Pick<Rectangle, 'width' | 'height'> {
  return {
    width: Math.round(PET_BASE_SIZE.width * petScale),
    height: Math.round(PET_BASE_SIZE.height * petScale)
  }
}

function defaultPetBounds(): Rectangle {
  const workArea = screen.getPrimaryDisplay().workArea
  const size = getPetSize()
  return {
    x: workArea.x + workArea.width - size.width - 32,
    y: workArea.y + workArea.height - size.height - 24,
    ...size
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
  const normalized = { ...stored, ...getPetSize() }
  return isVisibleOnAnyDisplay(normalized) ? normalized : defaultPetBounds()
}

function persistPetBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed() || currentMode !== 'pet') return
  petBounds = { ...mainWindow.getBounds(), ...getPetSize() }
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

function returnToPet(window: BrowserWindow): void {
  setWindowMode(window, 'pet')
  window.webContents.send('app:return-to-pet')
  showWindow()
}

function sendPetGreeting(): void {
  showWindow()
  mainWindow?.webContents.send('pet:say', '我在。刚刚好像听见你叫我了。')
}

function setWindowMode(window: BrowserWindow, mode: WindowMode): void {
  if (mode === currentMode) return
  window.setIgnoreMouseEvents(false)

  if (mode === 'room') {
    persistPetBounds()
    currentMode = 'room'
    window.webContents.setZoomFactor(1)
    window.setResizable(true)
    window.setSkipTaskbar(false)
    window.setMinimumSize(920, 640)
    window.setMaximumSize(10_000, 10_000)
    window.setSize(ROOM_SIZE.width, ROOM_SIZE.height, true)
    window.center()
    return
  }

  currentMode = 'pet'
  const size = getPetSize()
  window.unmaximize()
  window.webContents.setZoomFactor(petScale)
  window.setMinimumSize(size.width, size.height)
  window.setMaximumSize(size.width, size.height)
  window.setResizable(false)
  window.setSkipTaskbar(true)
  window.setBounds(petBounds ?? restorePetBounds(), true)
  window.setAlwaysOnTop(true)
}

function setPetScale(window: BrowserWindow, value: unknown): number {
  const nextScale = normalizePetScale(value)
  if (nextScale === petScale) return petScale

  const previous = petBounds ?? restorePetBounds()
  petScale = nextScale
  setSetting(SCALE_SETTING, petScale)
  const size = getPetSize()
  petBounds = {
    x: Math.round(previous.x + (previous.width - size.width) / 2),
    y: Math.round(previous.y + previous.height - size.height),
    ...size
  }
  if (currentMode === 'pet') {
    window.webContents.setZoomFactor(petScale)
    window.setMinimumSize(size.width, size.height)
    window.setMaximumSize(size.width, size.height)
    window.setBounds(petBounds, true)
  }
  setSetting(POSITION_SETTING, petBounds)
  return petScale
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
    minWidth: petBounds.width,
    minHeight: petBounds.height,
    maxWidth: petBounds.width,
    maxHeight: petBounds.height,
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
  window.webContents.setZoomFactor(petScale)

  window.on('ready-to-show', () => window.show())
  window.on('move', schedulePetBoundsSave)
  window.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    if (currentMode === 'room') returnToPet(window)
    else window.hide()
  })
  window.webContents.on('context-menu', () => createContextMenu().popup({ window }))
  if (is.dev) {
    window.webContents.on('console-message', (event) => {
      console.log(`[renderer:${event.level}] ${event.message}`)
    })
  }
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
  petScale = normalizePetScale(getSetting(SCALE_SETTING, DEFAULT_PET_SCALE))
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
  ipcMain.handle('window:get-pet-scale', () => petScale)
  ipcMain.handle('window:set-pet-scale', (event, value: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? setPetScale(window, value) : petScale
  })
  ipcMain.handle('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (currentMode === 'room') returnToPet(window)
    else window.hide()
  })
  ipcMain.on('window:show-context-menu', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) createContextMenu().popup({ window })
  })
  ipcMain.on('window:set-mouse-passthrough', (event, enabled: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || currentMode !== 'pet') return
    const shouldIgnore = enabled === true
    window.setIgnoreMouseEvents(shouldIgnore, shouldIgnore ? { forward: true } : undefined)
  })
  ipcMain.on('window:drag-start', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || currentMode !== 'pet') return
    window.setIgnoreMouseEvents(false)
    const [windowX, windowY] = window.getPosition()
    const cursor = screen.getCursorScreenPoint()
    dragOrigin = { mouseX: cursor.x, mouseY: cursor.y, windowX, windowY }
  })
  ipcMain.on('window:drag-move', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || !dragOrigin || currentMode !== 'pet') return
    const cursor = screen.getCursorScreenPoint()
    window.setBounds({
      x: Math.round(dragOrigin.windowX + cursor.x - dragOrigin.mouseX),
      y: Math.round(dragOrigin.windowY + cursor.y - dragOrigin.mouseY),
      ...getPetSize()
    })
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
