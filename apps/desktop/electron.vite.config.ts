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

// The desktop app's package.json sets "type": "module", so every .js file
// under apps/desktop is parsed as ESM. electron-vite can default to .mjs for
// main/preload output in that case, but our main process references the
// preload as "../preload/index.js" — force the output filenames to .js so
// the paths line up and keep them as ESM (format: "es").
const esJsOutput = {
  format: "es" as const,
  entryFileNames: "[name].js",
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceBundled })],
    build: {
      rollupOptions: {
        external: ["better-sqlite3"],
        output: esJsOutput,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceBundled })],
    build: {
      rollupOptions: {
        output: esJsOutput,
      },
    },
  },
  renderer: {
    resolve: {
      // Array form so we can order entries — the globals.css alias must take
      // precedence over the generic "@workspace/ui" prefix, otherwise the
      // latter rewrites "@workspace/ui/globals.css" to src/globals.css
      // (which doesn't exist; the real file lives under src/styles/).
      alias: [
        { find: "@", replacement: resolve("src/renderer") },
        {
          find: "@workspace/ui/globals.css",
          replacement: resolve("../../packages/ui/src/styles/globals.css"),
        },
        {
          find: /^@workspace\/ui\/(.*)$/,
          replacement: resolve("../../packages/ui/src") + "/$1",
        },
      ],
    },
    plugins: [react(), tailwindcss()],
  },
})
