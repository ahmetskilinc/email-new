import { defineConfig } from "drizzle-kit"
import { join } from "path"

export default defineConfig({
  schema: "./src/main/db/schema.ts",
  out: "./src/main/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: join(
      process.env.HOME ?? process.env.USERPROFILE ?? ".",
      ".zeitmail",
      "zeitmail.db",
    ),
  },
})
