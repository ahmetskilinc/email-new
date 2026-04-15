console.log("[renderer] main.tsx: module loading")

import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import { RootErrorBoundary } from "./components/root-error-boundary"
import "@workspace/ui/globals.css"

console.log("[renderer] main.tsx: imports resolved, about to mount")

const rootEl = document.getElementById("root")
if (!rootEl) {
  console.error("[renderer] main.tsx: #root element not found")
} else {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </React.StrictMode>,
    )
    console.log("[renderer] main.tsx: React mounted")
  } catch (err) {
    console.error("[renderer] main.tsx: mount threw", err)
    rootEl.innerHTML = `<pre style="padding:2rem;white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;color:#b00020">${String(err)}\n\n${(err as Error)?.stack ?? ""}</pre>`
  }
}
