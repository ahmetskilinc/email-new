import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from "electron"
import { join } from "path"
import { electronApp, optimizer, is } from "@electron-toolkit/utils"
import { loadEnv } from "./env"
import { initDatabase, runMigrations } from "./db"
import { registerIpcHandlers } from "./ipc"
import { handleMicrosoftProtocolCallback } from "./auth/oauth"
import { startBackgroundSync, stopBackgroundSync } from "./sync"

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

  console.log("[main] is.dev:", is.dev)
  console.log("[main] ELECTRON_RENDERER_URL:", process.env.ELECTRON_RENDERER_URL)

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    console.log("[main] loading dev URL:", process.env.ELECTRON_RENDERER_URL)
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    // Auto-open DevTools in dev so renderer errors are immediately visible.
    mainWindow.webContents.openDevTools({ mode: "detach" })
  } else {
    const filePath = join(__dirname, "../renderer/index.html")
    console.log("[main] loading file:", filePath)
    mainWindow.loadFile(filePath)
    mainWindow.webContents.openDevTools({ mode: "detach" })
  }

  mainWindow.webContents.on(
    "did-fail-load",
    (_e, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[main] did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`,
      )
    },
  )
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

  // Load .env (userData/.env in prod, repo-root .env in dev) so OAuth
  // credentials and other secrets are available to IPC handlers.
  loadEnv()

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

  // Kick off background mail sync.
  startBackgroundSync(() => mainWindow)

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
    stopBackgroundSync()
    app.quit()
  }
})

app.on("before-quit", () => {
  stopBackgroundSync()
})
