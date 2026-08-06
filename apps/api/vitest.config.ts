import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    // pglite (WASM Postgres) boot + argon2 hashing can exceed the 5s default
    // under parallel worker load; raise timeouts to keep integration tests
    // deterministic.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Catalog tests boot buildApp() which validates env. The CATALOG layer never
    // queries the DB (postgres-js connects lazily), so a dummy URL is enough to
    // satisfy env validation without a real Postgres.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/xophim_test",
    },
  },
});
