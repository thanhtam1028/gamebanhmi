import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Chuyển các migration thật của dự án vào môi trường test để áp dụng trong setup file
        bindings: { TEST_MIGRATIONS: await readD1Migrations(path.join(root, "migrations")) },
      },
    })),
  ],
  test: {
    include: ["test/**/*.test.js"],
    setupFiles: ["./test/apply-migrations.js"],
  },
});
