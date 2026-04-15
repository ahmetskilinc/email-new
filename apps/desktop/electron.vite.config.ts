import { resolve } from "path"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Workspace packages that ship raw .ts sources (no build step) must be
// *bundled* into the main/preload outputs — if externalizeDepsPlugin leaves
// them as runtime imports, Node's ESM loader chokes on the .ts extension.
// Their transitive runtime deps (googleapis, microsoft-graph-client, etc.)
// still get externalized normally because they're listed in the desktop
// app's own package.json.
const workspaceBundled = ["@workspace/core", "@workspace/ui"]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceBundled })],
    build: {
      rollupOptions: {
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceBundled })],
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer"),
        "@workspace/ui": resolve("../../packages/ui/src"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
