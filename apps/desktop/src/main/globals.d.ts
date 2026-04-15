// Ambient declarations for the Electron main process.
//
// Vite resolves `?raw` suffixes to string content at build time. TypeScript
// doesn't know about that on its own, so we declare the shape here for any
// file imported with the `?raw` query.

declare module "*?raw" {
  const content: string
  export default content
}
