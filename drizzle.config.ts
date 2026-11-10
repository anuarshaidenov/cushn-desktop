import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into `drizzle/` from the schema (`pnpm db:generate`).
// The app applies them itself at startup (`src/main/db/index.ts`); there is no
// database to push to at build time.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/main/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
