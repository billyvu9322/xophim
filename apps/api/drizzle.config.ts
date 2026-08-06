import { defineConfig } from "drizzle-kit";

import { env } from "./src/config/env.js";

// Drizzle Kit config — migrations live in ./drizzle, schema in src/db/schema.
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
