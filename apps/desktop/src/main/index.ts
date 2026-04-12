import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from "electron"
import { join } from "path"
import { electronApp, optimizer, is } from "@electron-toolkit/utils"
import { initDatabase, runMigrations } from "./db"
import { registerIpcHandlers } from "./ipc"
import { handleMicrosoftProtocolCallback } from "./auth/oauth"

// Register zeitmail:// as a custom protocol for Microsoft OAuth deep links.
// This must be called before app.whenReady() to take effect.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("zeitmail", process.execPath, [
      process.argv[1]!,
    ])
  }
} else {
  app.setAsDefaultProtocolClient("zeitmail")
}

// ---------------------------------------------------------------------------
// Single instance lock & deep-link handling (Windows / Linux)
// ---------------------------------------------------------------------------
// On Windows and Linux, when a zeitmail:// link is clicked while the app is
// already running, the OS launches a *second* instance. Electron's single-
// instance lock prevents that second instance from fully starting and instead
// fires the "second-instance" event on the original instance, forwarding the
// argv (which contains the deep-link URL).
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Another instance already holds the lock — quit immediately.
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

/**
 * Extract a zeitmail:// URL from an argv array and pass it to the Microsoft
 * OAuth callback handler.
 */
function handleArgvDeepLink(argv: string[]): void {
  const deepLinkUrl = argv.find((arg) => arg.startsWith("zeitmail://"))
  if (deepLinkUrl) {
    handleMicrosoftProtocolCallback(deepLinkUrl)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: "deny" }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

function createTray(): void {
  const icon = nativeImage.createFromPath(
    join(__dirname, "../../resources/icon.png"),
  )
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Tulli",
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ])

  tray.setToolTip("Tulli")
  tray.setContextMenu(contextMenu)
  tray.on("click", () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.zeitmail.desktop")

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  initDatabase()
  await runMigrations()

  // Register IPC handlers
  registerIpcHandlers()

  // Create window and tray
  createWindow()
  createTray()

  // ----- Deep-link handling ------------------------------------------------

  // macOS: deep links arrive via the "open-url" event.
  app.on("open-url", (event: Electron.Event, url: string) => {
    event.preventDefault()
    if (url.startsWith("zeitmail://")) {
      handleMicrosoftProtocolCallback(url)
    }
    // Bring the existing window to front when a deep link comes in.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // Windows / Linux: when a second instance is launched with a deep-link URL,
  // the "second-instance" event fires on the first instance.
  app.on("second-instance", (_event: Electron.Event, argv: string[]) => {
    handleArgvDeepLink(argv)
    // Bring the existing window to front.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // Handle the case where the app itself was *initially* launched via a deep
  // link (cold start on Windows / Linux).
  handleArgvDeepLink(process.argv)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
