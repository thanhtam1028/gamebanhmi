import { defineConfig } from "@playwright/test";

const PORT = 8787;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome", // dùng Chrome có sẵn trên máy và trên runner GitHub, không tải thêm trình duyệt
    trace: "retain-on-failure",
  },
  // Chạy đúng Worker thật với D1 cục bộ (không đụng tới database trên Cloudflare)
  webServer: {
    command: `npx wrangler d1 migrations apply DB --local && npx wrangler dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/scores`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
