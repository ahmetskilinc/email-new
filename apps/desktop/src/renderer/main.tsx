import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import { RootErrorBoundary } from "./components/root-error-boundary"
import "@workspace/ui/globals.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
)
