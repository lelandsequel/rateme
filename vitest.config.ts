import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config — mirrors the `@/*` path alias from tsconfig.json so test
 * files can import library + route modules the same way the app does.
 *
 * Without this, importing a route handler that uses `@/lib/...` from a
 * `*.test.ts` file fails to resolve.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
