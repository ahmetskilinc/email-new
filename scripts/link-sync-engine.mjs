// Vendors the local sync-engine packages (../sync-engine) into node_modules.
//
// The engine lives in its own repo and its 0.4.x packages are not on npm
// yet. Symlinks would be the obvious answer, but Turbopack refuses to follow
// links that leave the project root and Vercel's output tracing would miss
// them — so this postinstall step COPIES the built packages instead. Re-run
// `bun install` (or this script) after rebuilding the engine to refresh.
//
// Once the packages are published, delete this script and depend on
// @ahmetskilinc/sync-{core,client,server,react}@^0.4.0 normally.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const engine = resolve(root, "..", "sync-engine", "packages")

if (!existsSync(engine)) {
  console.warn(
    `[link-sync-engine] ${engine} not found — clone ahmetskilinc/sync-engine next to this repo`
  )
  process.exit(0)
}

const scopeDir = join(root, "node_modules", "@ahmetskilinc")
mkdirSync(scopeDir, { recursive: true })

for (const [name, pkg] of [
  ["sync-core", "core"],
  ["sync-client", "client"],
  ["sync-server", "server"],
  ["sync-react", "react"],
]) {
  const target = join(engine, pkg)
  const dest = join(scopeDir, name)
  if (!existsSync(join(target, "dist", "index.js"))) {
    console.warn(
      `[link-sync-engine] ${target} has no dist build — run \`bun run build\` in the sync-engine repo first`
    )
    continue
  }
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  for (const entry of ["package.json", "dist", "src"]) {
    const from = join(target, entry)
    if (existsSync(from)) {
      cpSync(from, join(dest, entry), { recursive: true, dereference: true })
    }
  }
}
console.log("[link-sync-engine] vendored @ahmetskilinc/sync-* from ../sync-engine")
